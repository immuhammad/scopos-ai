"""The intake pipeline behind POST /applications — the core of the product.
One funnel: outbound-discovered founders run through the SAME steps as inbound
applicants. One human = one founder record (dedup by email, then handle).
LLM failures degrade into the deal's errors field; nothing here raises."""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import MODEL_MAIN, MODEL_MINI
from app.llm import ExtractedClaims, FilterResult, FootprintAssessment, safe_parse
from app.models import (ClaimRow, DealFounderRow, DealRow, FounderRow, SignalRow,
                        ThesisRow)
from app.schemas import ApplicationPayload
from app.services.axes import assess_axes
from app.services.founder_score import recompute_founder_score
from app.services.github_enrich import enrich_github, handle_from_url
from app.services.memo import generate_memo
from app.services.slugs import unique_slug
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
        "Deck attached: {}".format("yes" if payload.has_deck else "no"),
    ]
    if payload.video_pitch_url:
        parts.append("Video pitch: {}".format(payload.video_pitch_url))
    if payload.cv_text:
        parts.append("CV / footprint text:\n{}".format(payload.cv_text[:4000]))
    return "\n".join(parts)


async def process_application(db: Session, payload: ApplicationPayload,
                              source: str = "Inbound Application",
                              new_contact_status: str = "Applied",
                              ) -> Tuple[DealRow, List[str], List[str]]:
    """Returns (deal_row, matched_founder_ids, errors). Never raises for LLM issues."""
    errors: List[str] = []
    now = _now_iso()

    # 1) founder dedup — one human = one founder record across all projects
    founder_rows: List[FounderRow] = []
    matched: List[str] = []
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
            founder_rows.append(row)

    # 2) create the deal + store everything as signals (nothing discarded)
    deal_id = unique_slug(db, DealRow, payload.company)
    links = [{"label": "Pitch Deck", "href": None}] if payload.has_deck else []
    links += [{"label": _link_label(u), "href": u} for u in payload.links]
    deal = DealRow(
        id=deal_id, company=payload.company, tagline=payload.tagline or "",
        sector=payload.sector or "Not disclosed", stage=payload.stage or "Not disclosed",
        geography=payload.geography or "Not disclosed", source=source,
        pipeline_stage="Application Received", stage_started_at=now,
        next_action="Screening in progress.", links=links, created_at=now,
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
                         "payload": payload.model_dump()},
                     fetched_at=now))
    if payload.cv_text:
        db.add(SignalRow(deal_id=deal_id,
                         founder_id=founder_rows[0].id if founder_rows else None,
                         source="Application", signal_type="cv",
                         raw_json={"text": payload.cv_text[:8000]}, fetched_at=now))
    for url in payload.links:
        db.add(SignalRow(deal_id=deal_id, source="Application", signal_type="link",
                         raw_json={"url": url}, fetched_at=now))
    db.flush()

    # 3) first-pass viability filter — non-viable stays in DB, out of dealflow
    verdict, err = await safe_parse(
        "filter", MODEL_MINI,
        "You screen startup applications for a VC. Decide if this is a genuine "
        "startup application vs spam, a joke, or gibberish. Thin-but-genuine "
        "early-stage applications ARE viable — only reject clear non-startups.",
        app_text, FilterResult)
    if err:
        errors.append(err)  # can't filter → treat as viable, flag degradation
    elif not verdict.is_viable:
        deal.viable = False
        deal.filter_reason = verdict.reason
        deal.next_action = "Filtered as non-viable: {}".format(verdict.reason)
        deal.errors = errors
        db.commit()
        return deal, matched, errors

    # 4) claim extraction, each starting at heuristic trust 50
    extraction, err = await safe_parse(
        "claims", MODEL_MINI,
        "Extract the concrete, checkable claims a VC would want verified from this "
        "application (traction, revenue, credentials, tech, customers, TAM). Skip "
        "vague aspirations. At most {} claims.".format(MAX_CLAIMS),
        app_text, ExtractedClaims)
    claim_rows: List[ClaimRow] = []
    if err:
        errors.append(err)
    else:
        for n, c in enumerate(extraction.claims[:MAX_CLAIMS], start=1):
            row = ClaimRow(
                id="{}-c{}".format(deal_id, n), deal_id=deal_id, claim=c.claim,
                status="unverified", trust_score=50,
                detail="Awaiting verification.", source=c.source or "Application",
                collected_at=now,
                ai_explanation="Extracted from application; heuristic initial trust 50.",
                review_notes=[])
            db.add(row)
            claim_rows.append(row)
    db.flush()

    # 5) GitHub enrichment per founder (best-effort)
    for f in founder_rows:
        handle = handle_from_url(f.github)
        if not handle:
            continue
        data = await enrich_github(handle)
        if data is None:
            continue
        db.add(SignalRow(founder_id=f.id, deal_id=deal_id, source="GitHub API",
                         signal_type="github_profile", raw_json=data, fetched_at=now))
    db.flush()

    # 6) cold-start check — first-class, not a penalty
    cold_note: Optional[str] = None
    footprints = {}
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
    if not has_track_record:
        deal.is_cold_start = True
        fp, err = await safe_parse(
            "footprint", MODEL_MAIN,
            "Cold-start founder assessment: no track record signals exist, so assess "
            "the FOOTPRINT in this application/CV text — writing specificity, domain "
            "insight, evidence of small shipped artifacts. Score 0-30. Provide an "
            "explicit uncertainty note stating that confidence intervals are wider "
            "than for founders with track records.",
            app_text, FootprintAssessment)
        if err:
            errors.append(err)
            cold_note = ("Cold-start founder: no track-record signals; footprint "
                         "assessment unavailable — uncertainty is wider than usual.")
        else:
            cold_note = fp.uncertainty_note
            for f in founder_rows:
                footprints[f.id] = fp.score

    # 7) Founder Score per person — persistent, transparent, never reset
    for f in founder_rows:
        recompute_founder_score(
            db, f, "Application to {}".format(payload.company),
            footprint=footprints.get(f.id, 0), footprint_note=cold_note)
    db.flush()

    # 8) three independent axes (concurrent gpt-4o calls; thesis as context)
    claims_text = "\n".join("- [{}] {}".format(c.status, c.claim) for c in claim_rows) \
        or "No claims extracted."
    evidence_parts = [app_text]
    for f in founder_rows:
        for s in db.execute(select(SignalRow).where(
                SignalRow.founder_id == f.id,
                SignalRow.signal_type == "github_profile")).scalars().all():
            evidence_parts.append("GitHub {}: {}".format(f.name, s.raw_json))
    fa, mk, iv, cov = await assess_axes(
        db, deal, founder_rows, claims_text, "\n\n".join(evidence_parts),
        active_thesis(db), errors, cold_start_note=cold_note)

    # 9) trust pipeline per claim (internal cross-artifact → Tavily external)
    other_evidence = "\n\n".join(evidence_parts)
    await asyncio.gather(*[
        verify_claim(c, payload.company,
                     other_evidence + "\nOther claims: " + "; ".join(
                         x.claim for x in claim_rows if x.id != c.id),
                     errors)
        for c in claim_rows])
    refresh_deal_trust_counters(db, deal)

    # 10) memo
    axes_summary = ("Founder axis {} ({}): {} | Market {} : {} | Idea-vs-market {}: {}"
                    ).format(fa["score"], fa["trend"], fa["summary"],
                             mk["rating"], mk["summary"], iv["score"], iv["verdict"])
    await generate_memo(db, deal, axes_summary, errors)

    # 11) advance to Screening with a concrete next action
    deal.pipeline_stage = "Screening"
    deal.stage_started_at = _now_iso()
    if deal.alerts:
        deal.next_action = "Resolve {} contradiction(s) before decision.".format(deal.alerts)
    elif deal.is_cold_start:
        deal.next_action = "Cold-start footprint reviewed — schedule founder call."
    else:
        deal.next_action = "Review three-axis scorecard and schedule founder call."
    deal.errors = errors
    db.commit()
    return deal, matched, errors
