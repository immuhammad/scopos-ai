"""The intake pipeline — the core of the product. One funnel: outbound and
inbound run the SAME steps. Claims are quote-anchored (no quote → no claim),
every step is traced, investor feedback for the active thesis is injected as
context, and LLM failures degrade into the deal's errors field — nothing here
raises.

run_intelligence() is reusable: POST /applications calls it on a fresh deal;
app/seed/reprocess.py calls it on existing deals to regenerate claims/axes/
memos in place while preserving ids."""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import MODEL_MAIN, MODEL_MINI
from app.llm import ExtractedClaims, FilterResult, FootprintAssessment, safe_parse
from app.models import (ClaimRow, DealFounderRow, DealRow, FounderRow, SignalRow,
                        ThesisRow)
from app.schemas import ApplicationPayload
from app.services.axes import assess_axes
from app.services.feedback import feedback_context
from app.services.founder_score import recompute_founder_score
from app.services.github_enrich import enrich_github, handle_from_url
from app.services.memo import generate_memo
from app.services.pdftext import extract_pdf_text
from app.services.slugs import unique_slug
from app.services.textmatch import quote_in_text
from app.services.trace import record_trace, traced
from app.services.trust import refresh_deal_trust_counters, verify_claim

MAX_CLAIMS = 8


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _link_label(url: str) -> str:
    low = url.lower()
    if "github.com" in low:
        return "GitHub"
    if "linkedin.com" in low:
        return "LinkedIn"
    if "substack" in low:
        return "Substack"
    if "news.ycombinator" in low:
        return "Show HN post"
    return "Website"


def active_thesis(db: Session) -> Optional[ThesisRow]:
    return db.execute(select(ThesisRow).where(ThesisRow.active.is_(True))).scalars().first()


def find_founder(db: Session, email: str, github: Optional[str] = None,
                 linkedin: Optional[str] = None) -> Optional[FounderRow]:
    """Dedup: email (case-insensitive) first, then github/linkedin handle."""
    if email:
        row = db.execute(select(FounderRow).where(
            func.lower(FounderRow.email) == email.lower())).scalars().first()
        if row:
            return row
    handle = handle_from_url(github)
    if handle:
        for row in db.execute(select(FounderRow).where(
                FounderRow.github.isnot(None))).scalars().all():
            if handle_from_url(row.github) == handle:
                return row
    if linkedin:
        row = db.execute(select(FounderRow).where(
            func.lower(FounderRow.linkedin) == linkedin.lower())).scalars().first()
        if row:
            return row
    return None


def _application_text(payload: ApplicationPayload) -> str:
    parts = [
        "Company: {}".format(payload.company),
        "Tagline: {}".format(payload.tagline or "Not disclosed"),
        "Sector: {} | Stage: {} | Geography: {}".format(
            payload.sector or "Not disclosed", payload.stage or "Not disclosed",
            payload.geography or "Not disclosed"),
        "Founders: " + "; ".join("{} ({})".format(f.name, f.role) for f in payload.founders),
        "Links: " + (", ".join(payload.links) if payload.links else "none"),
        "Funding sought: {}".format("${:,}".format(payload.ask_usd) if payload.ask_usd else "Not disclosed"),
    ]
    video = payload.video_pitch or payload.video_pitch_url
    if video:
        parts.append("Video pitch: {}".format(video))
    return "\n".join(parts)


async def run_intelligence(db: Session, deal: DealRow, founder_rows: List[FounderRow],
                           app_text: str, deck_text: Optional[str],
                           cv_text: Optional[str], errors: List[str],
                           restore_stage: Optional[str] = None,
                           recompute_scores: bool = True) -> None:
    """Claims → enrichment → cold-start → founder score → axes → trust → memo,
    all traced. Mutates rows; commits at the end."""
    now = _now_iso()
    source_blob = "\n\n".join(x for x in [
        "APPLICATION:\n" + app_text,
        ("PITCH DECK TEXT:\n" + deck_text) if deck_text else None,
        ("CV / FOOTPRINT TEXT:\n" + cv_text) if cv_text else None,
    ] if x)

    # claim extraction — quote-anchored, with a code-level guard
    with traced(db, deal.id, "extraction", MODEL_MINI) as t:
        extraction, err = await safe_parse(
            "claims", MODEL_MINI,
            "Extract the concrete, checkable claims the FOUNDER ACTUALLY ASSERTS in "
            "this application/deck/CV (traction, revenue, credentials, tech, "
            "customers, TAM). For each claim, source_quote MUST be the exact "
            "sentence copied verbatim from the text — never paraphrase, never infer, "
            "never invent a claim the text does not make. If the text asserts few "
            "claims, return few. At most {} claims.".format(MAX_CLAIMS),
            source_blob[:9000], ExtractedClaims)
        claim_rows: List[ClaimRow] = []
        dropped = 0
        if err:
            errors.append(err)
            t["summary"] = "degraded: {}".format(err[:120])
        else:
            n = 0
            for c in extraction.claims[:MAX_CLAIMS]:
                if not c.source_quote or not quote_in_text(c.source_quote, source_blob):
                    dropped += 1  # no verifiable quote → no claim (kills invented claims)
                    continue
                n += 1
                row = ClaimRow(
                    id="{}-c{}".format(deal.id, n), deal_id=deal.id, claim=c.claim,
                    status="unverified", trust_score=50,
                    detail="Awaiting verification.", source=c.source or "Application",
                    source_quote=c.source_quote, collected_at=now,
                    ai_explanation="Extracted from application; heuristic initial trust 50.",
                    review_notes=[])
                db.add(row)
                claim_rows.append(row)
            t["summary"] = "{} claims extracted, {} dropped (no verifiable source quote)".format(
                len(claim_rows), dropped)
    db.flush()

    # GitHub enrichment per founder (best-effort)
    with traced(db, deal.id, "enrichment") as t:
        enriched = 0
        for f in founder_rows:
            handle = handle_from_url(f.github)
            if not handle:
                continue
            recent = db.execute(select(SignalRow).where(
                SignalRow.founder_id == f.id,
                SignalRow.signal_type == "github_profile")).scalars().first()
            if recent is not None:
                continue
            data = await enrich_github(handle)
            if data is None:
                continue
            db.add(SignalRow(founder_id=f.id, deal_id=deal.id, source="GitHub API",
                             signal_type="github_profile", raw_json=data, fetched_at=now))
            enriched += 1
        t["summary"] = "{} founder profiles enriched via GitHub".format(enriched)
    db.flush()

    # cold-start check — first-class, not a penalty
    cold_note: Optional[str] = None
    footprints: Dict[str, int] = {}
    has_track_record = False
    for f in founder_rows:
        sigs = db.execute(select(SignalRow).where(
            SignalRow.founder_id == f.id,
            SignalRow.signal_type.in_(("github_profile", "hn_post", "launch")))
        ).scalars().all()
        strong = any((s.raw_json or {}).get("total_stars", 0) > 0 or
                     s.signal_type in ("hn_post", "launch") for s in sigs)
        if strong or (f.founder_score or 0) > 0:
            has_track_record = True
    if not has_track_record or deal.is_cold_start:
        deal.is_cold_start = True
        with traced(db, deal.id, "cold-start", MODEL_MAIN) as t:
            fp, err = await safe_parse(
                "footprint", MODEL_MAIN,
                "Cold-start founder assessment: no track record signals exist, so assess "
                "the FOOTPRINT in this application/CV text — writing specificity, domain "
                "insight, evidence of small shipped artifacts. Score 0-30. Provide an "
                "explicit uncertainty note stating that confidence intervals are wider "
                "than for founders with track records.",
                source_blob[:9000], FootprintAssessment)
            if err:
                errors.append(err)
                cold_note = ("Cold-start founder: no track-record signals; footprint "
                             "assessment unavailable — uncertainty is wider than usual.")
                t["summary"] = "degraded"
            else:
                cold_note = fp.uncertainty_note
                for f in founder_rows:
                    footprints[f.id] = fp.score
                t["summary"] = "footprint {}/30; wider-uncertainty note attached".format(fp.score)

    # Founder Score per person — persistent, transparent, never reset.
    # Reprocessing an existing deal preserves scores untouched: the score is
    # per PERSON, not per deal, and a deal-level regeneration must not move it.
    with traced(db, deal.id, "founder-score") as t:
        if recompute_scores:
            deltas = []
            for f in founder_rows:
                score, delta = recompute_founder_score(
                    db, f, "Application to {}".format(deal.company),
                    footprint=footprints.get(f.id, 0), footprint_note=cold_note)
                deltas.append("{} {} ({:+d})".format(f.name, score, delta))
            t["summary"] = "; ".join(deltas) or "no founders"
        else:
            t["summary"] = "preserved (reprocess — per-person scores are never reset)"
    db.flush()

    # investor feedback for the active thesis — Memory sharpening context
    thesis = active_thesis(db)
    fb_context = feedback_context(db, thesis)
    record_trace(db, deal.id, "feedback-context", "",
                 "{} feedback note(s) injected for thesis '{}'".format(
                     fb_context.count("\n- "), thesis.name if thesis else "none"))

    # three independent axes (concurrent gpt-4o calls; thesis + feedback as context)
    claims_text = "\n".join("- [{}] {}".format(c.status, c.claim) for c in claim_rows) \
        or "No claims extracted."
    evidence_parts = [source_blob]
    for f in founder_rows:
        for s in db.execute(select(SignalRow).where(
                SignalRow.founder_id == f.id,
                SignalRow.signal_type == "github_profile")).scalars().all():
            evidence_parts.append("GitHub {}: {}".format(f.name, s.raw_json))
    t0 = datetime.now(timezone.utc)
    fa, mk, iv, cov = await assess_axes(
        db, deal, founder_rows, claims_text, "\n\n".join(evidence_parts),
        thesis, errors, cold_start_note=cold_note, extra_context=fb_context)
    axis_ms = int((datetime.now(timezone.utc) - t0).total_seconds() * 1000 / 3)
    record_trace(db, deal.id, "axis-founder", MODEL_MAIN,
                 "score {} ({}): {}".format(fa["score"], fa["trend"], fa["summary"][:120]), axis_ms)
    record_trace(db, deal.id, "axis-market", MODEL_MAIN,
                 "{} ({}): {}".format(mk["rating"], mk["trend"], mk["summary"][:120]), axis_ms)
    record_trace(db, deal.id, "axis-idea-vs-market", MODEL_MAIN,
                 "score {} ({}): {}".format(iv["score"], iv["trend"], iv["verdict"][:120]), axis_ms)

    # trust pipeline per claim (internal cross-artifact → Tavily external)
    other_evidence = "\n\n".join(evidence_parts)
    company_desc = "{} — {}".format(deal.company, deal.tagline or "early-stage startup")

    async def _verify(c: ClaimRow):
        t0c = datetime.now(timezone.utc)
        await verify_claim(c, company_desc,
                           other_evidence + "\nOther claims: " + "; ".join(
                               x.claim for x in claim_rows if x.id != c.id),
                           errors)
        record_trace(db, deal.id, "trust:{}".format(c.id), MODEL_MINI,
                     "{} (trust {}): {}".format(c.status, c.trust_score, c.claim[:100]),
                     int((datetime.now(timezone.utc) - t0c).total_seconds() * 1000))
    await asyncio.gather(*[_verify(c) for c in claim_rows])
    refresh_deal_trust_counters(db, deal)

    # memo
    axes_summary = ("Founder axis {} ({}): {} | Market {} : {} | Idea-vs-market {}: {}"
                    ).format(fa["score"], fa["trend"], fa["summary"],
                             mk["rating"], mk["summary"], iv["score"], iv["verdict"])
    with traced(db, deal.id, "memo", MODEL_MAIN) as t:
        ask_line = "${:,}".format(deal.ask_usd) if deal.ask_usd else "Not disclosed"
        memo = await generate_memo(db, deal, axes_summary, errors,
                                   extra_context=fb_context, ask_line=ask_line)
        t["summary"] = (memo.get("snapshot") or "")[:150]

    # advance stage with a concrete next action
    deal.pipeline_stage = restore_stage or "Screening"
    deal.stage_started_at = _now_iso()
    if deal.alerts:
        deal.next_action = "Resolve {} contradiction(s) before decision.".format(deal.alerts)
    elif deal.is_cold_start:
        deal.next_action = "Cold-start footprint reviewed — schedule founder call."
    else:
        deal.next_action = "Review three-axis scorecard and schedule founder call."
    deal.errors = errors
    db.commit()


async def process_application(db: Session, payload: ApplicationPayload,
                              source: str = "Inbound Application",
                              new_contact_status: str = "Applied",
                              ) -> Tuple[DealRow, List[str], List[str], List[str]]:
    """Returns (deal_row, matched_founder_ids, new_founder_ids, errors)."""
    errors: List[str] = []
    now = _now_iso()

    # founder dedup — one human = one founder record across all projects
    founder_rows: List[FounderRow] = []
    matched: List[str] = []
    new_ids: List[str] = []
    for pf in payload.founders:
        existing = find_founder(db, pf.email, pf.github, pf.linkedin)
        if existing is not None:
            matched.append(existing.id)
            if existing.contact_status in ("Discovered", "Reviewing", "Contacted", "Invited to Apply"):
                existing.contact_status = new_contact_status
            existing.github = existing.github or pf.github
            existing.linkedin = existing.linkedin or pf.linkedin
            founder_rows.append(existing)
        else:
            fid = unique_slug(db, FounderRow, pf.name)
            row = FounderRow(
                id=fid, name=pf.name,
                role=pf.role if pf.role in ("CEO", "CTO", "COO", "CPO") else "Other",
                email=pf.email, linkedin=pf.linkedin, github=pf.github,
                location=payload.geography or "Not disclosed", expertise=[],
                founder_score=0, score_trend="flat", components=[], history=[],
                contact_status=new_contact_status, contradiction_count=0,
                bio="", created_at=now)
            db.add(row)
            db.flush()
            new_ids.append(fid)
            founder_rows.append(row)

    # PDF extraction (server-side, never fails the application)
    deck_text = payload.deck_text
    if not deck_text and payload.deck_file:
        deck_text = extract_pdf_text(payload.deck_file)
        if deck_text is None:
            errors.append("deck PDF: text extraction failed; stored file reference only")
    cv_text = payload.cv_text
    if not cv_text and payload.cv_file:
        cv_text = extract_pdf_text(payload.cv_file)
        if cv_text is None:
            errors.append("CV PDF: text extraction failed; stored file reference only")

    # create the deal + store everything as signals (nothing discarded)
    deal_id = unique_slug(db, DealRow, payload.company)
    links = [{"label": "Pitch Deck", "href": None}] if (payload.has_deck or deck_text) else []
    links += [{"label": _link_label(u), "href": u} for u in payload.links]
    deal = DealRow(
        id=deal_id, company=payload.company, tagline=payload.tagline or "",
        sector=payload.sector or "Not disclosed", stage=payload.stage or "Not disclosed",
        geography=payload.geography or "Not disclosed", source=source,
        pipeline_stage="Application Received", stage_started_at=now,
        next_action="Screening in progress.", links=links, created_at=now,
        ask_usd=payload.ask_usd or 100000,
        first_signal_at=now,
        decision_deadline=(datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        errors=[])
    db.add(deal)
    for i, f in enumerate(founder_rows):
        db.add(DealFounderRow(deal_id=deal_id, founder_id=f.id, lead=(i == 0),
                              role=f.role))
    app_text = _application_text(payload)
    db.add(SignalRow(deal_id=deal_id, founder_id=founder_rows[0].id if founder_rows else None,
                     source=source, signal_type="application",
                     raw_json={"text": "New application: {} — {}".format(
                         payload.company, payload.tagline or ""),
                         "full_text": app_text,
                         "payload": payload.model_dump(exclude={"deck_file", "cv_file"})},
                     fetched_at=now))
    if deck_text:
        db.add(SignalRow(deal_id=deal_id, source="Application", signal_type="deck_text",
                         raw_json={"text": deck_text[:12000]}, fetched_at=now))
    if cv_text:
        db.add(SignalRow(deal_id=deal_id,
                         founder_id=founder_rows[0].id if founder_rows else None,
                         source="Application", signal_type="cv",
                         raw_json={"text": cv_text[:12000]}, fetched_at=now))
    for url in payload.links:
        db.add(SignalRow(deal_id=deal_id, source="Application", signal_type="link",
                         raw_json={"url": url}, fetched_at=now))
    db.flush()

    # first-pass viability filter — non-viable stays in DB, out of dealflow
    with traced(db, deal.id, "filter", MODEL_MINI) as t:
        verdict, err = await safe_parse(
            "filter", MODEL_MINI,
            "You screen startup applications for a VC. Decide if this is a genuine "
            "startup application vs spam, a joke, or gibberish. Thin-but-genuine "
            "early-stage applications ARE viable — only reject clear non-startups.",
            app_text + (("\n\nDECK EXCERPT:\n" + deck_text[:2000]) if deck_text else ""),
            FilterResult)
        if err:
            errors.append(err)
            t["summary"] = "degraded → treated as viable"
        elif not verdict.is_viable:
            deal.viable = False
            deal.filter_reason = verdict.reason
            deal.next_action = "Filtered as non-viable: {}".format(verdict.reason)
            deal.errors = errors
            t["summary"] = "REJECTED: {}".format(verdict.reason[:150])
            db.commit()
            return deal, matched, new_ids, errors
        else:
            t["summary"] = "viable: {}".format(verdict.reason[:150])

    await run_intelligence(db, deal, founder_rows, app_text, deck_text, cv_text, errors)
    return deal, matched, new_ids, errors
