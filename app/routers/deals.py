import os
from datetime import datetime, timezone
from statistics import median
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.config import AUDIO_DIR
from app.db import get_db
from app.models import (AuditTrailRow, BriefingRow, ClaimRow, DealFounderRow, DealRow,
                        FounderRow, OutreachDraftRow, OutreachStateRow, PipelineTraceRow,
                        SignalRow)
from app.services.assemble import (claim_to_contract, deal_to_contract, latest_axes,
                                   latest_memo)
from app.services.briefing import generate_briefing, mp3_duration_sec
from app.services.feedback import store_feedback
from app.services.memo import fallback_memo, generate_memo
from app.services.outreach import draft_outreach, lead_signal_breakdown, signal_strength
from app.services.pipeline import active_thesis, run_intelligence
from app.services.trace import record_trace

router = APIRouter()

DECIDED_STAGES = ("Approved", "Declined")

_DECISION_STAGE = {
    "approve": "Approved",
    "approve_conditions": "Approved",
    "continue_diligence": "Diligence",
    "decline": "Declined",
}
_ANALYSIS_LABEL = {
    "approve": "Simulated investment decision",
    "approve_conditions": "Simulated investment decision",
    "decline": "Simulated decline",
    "continue_diligence": "Continued diligence",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_deal(db: Session, deal_id: str) -> DealRow:
    deal = db.get(DealRow, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="deal not found")
    return deal


def _decision_record(row: AuditTrailRow) -> schemas.DecisionRecord:
    return schemas.DecisionRecord(
        id="dec-{}".format(row.id), deal_id=row.deal_id,
        kind=row.decision if row.decision in _DECISION_STAGE else "continue_diligence",
        note=row.note, conditions=row.conditions, timestamp=row.timestamp,
        analysis_label=row.analysis_label or _ANALYSIS_LABEL.get(row.decision, ""),
        actor=row.actor or "Analyst")


@router.get("/deals", response_model=List[schemas.Deal])
def list_deals(status: str = Query(default="pending", pattern="^(pending|decided|all)$"),
               db: Session = Depends(get_db)):
    rows = db.execute(select(DealRow).where(DealRow.viable.is_(True))).scalars().all()
    if status == "pending":
        rows = [d for d in rows if d.pipeline_stage not in DECIDED_STAGES]
    elif status == "decided":
        rows = [d for d in rows if d.pipeline_stage in DECIDED_STAGES]
    deals = [deal_to_contract(db, d) for d in rows]
    # Ranked: starred/high-signal first, then founder-axis score desc.
    # The three axes are surfaced separately — never averaged into one number.
    return sorted(deals, key=lambda d: (not bool(d.starred), -d.founder_axis.score))


@router.get("/deals/{deal_id}", response_model=schemas.Deal)
def get_deal(deal_id: str, db: Session = Depends(get_db)):
    return deal_to_contract(db, _get_deal(db, deal_id))


@router.post("/deals/{deal_id}/star", response_model=schemas.Deal)
def star_deal(deal_id: str, payload: schemas.StarPayload, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    deal.starred = payload.starred
    db.commit()
    return deal_to_contract(db, deal)


@router.post("/deals/{deal_id}/stage", response_model=schemas.Deal)
def set_deal_stage(deal_id: str, payload: schemas.StagePayload,
                   db: Session = Depends(get_db)):
    """Triage swipes and pipeline drags land here. Validated against the
    PipelineStage union by the payload schema."""
    deal = _get_deal(db, deal_id)
    prev = deal.pipeline_stage
    deal.pipeline_stage = payload.stage
    deal.stage_started_at = _now_iso()  # timeInStageHours baseline reset
    if payload.next_action:
        deal.next_action = payload.next_action
    if payload.stage in DECIDED_STAGES and not deal.decided_at:
        deal.decided_at = _now_iso()
    record_trace(db, deal.id, "stage-change", "",
                 "{} → {}{}".format(prev, payload.stage,
                                    " · " + payload.next_action if payload.next_action else ""))
    db.commit()
    return deal_to_contract(db, deal)


@router.post("/deals/{deal_id}/decide", response_model=schemas.DecisionRecord)
def decide_deal(deal_id: str, payload: schemas.DecideV2Payload,
                db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    deal.pipeline_stage = _DECISION_STAGE[payload.decision]
    deal.stage_started_at = _now_iso()
    if deal.pipeline_stage in DECIDED_STAGES:
        deal.decided_at = _now_iso()
    deal.next_action = "Simulated decision recorded: {}. No external action was taken.".format(
        payload.decision.replace("_", " "))
    row = AuditTrailRow(
        deal_id=deal.id, decision=payload.decision, note=payload.note,
        conditions=payload.conditions, timestamp=_now_iso(),
        actor=payload.actor or "Analyst",
        analysis_label=_ANALYSIS_LABEL[payload.decision])
    db.add(row)
    # Memory sharpening: a decline (or an approve despite open alerts) diverges
    # from the pipeline's read — store the note as thesis-linked feedback.
    if payload.decision == "decline" or (
            payload.decision.startswith("approve") and (deal.alerts or 0) > 0):
        store_feedback(db, deal.id, payload.decision, payload.note, active_thesis(db))
        record_trace(db, deal.id, "investor-feedback", "",
                     "stored for thesis memory: {}".format(payload.note[:120]))
    record_trace(db, deal.id, "decision", "",
                 "{} — {}".format(payload.decision, payload.note[:150]))
    db.commit()
    return _decision_record(row)


@router.get("/deals/{deal_id}/decisions", response_model=List[schemas.DecisionRecord])
def list_decisions(deal_id: str, db: Session = Depends(get_db)):
    _get_deal(db, deal_id)
    rows = db.execute(select(AuditTrailRow).where(AuditTrailRow.deal_id == deal_id)
                      .order_by(AuditTrailRow.id.desc())).scalars().all()
    return [_decision_record(r) for r in rows]


@router.get("/deals/{deal_id}/claims/{claim_id}", response_model=schemas.Claim)
def get_claim(deal_id: str, claim_id: str, db: Session = Depends(get_db)):
    claim = db.get(ClaimRow, claim_id)
    if claim is None or claim.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="claim not found")
    return claim_to_contract(claim)


@router.post("/deals/{deal_id}/claims/{claim_id}/notes", response_model=schemas.Claim)
def add_claim_note(deal_id: str, claim_id: str, payload: schemas.ClaimNotePayload,
                   db: Session = Depends(get_db)):
    claim = db.get(ClaimRow, claim_id)
    if claim is None or claim.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="claim not found")
    claim.review_notes = list(claim.review_notes or []) + [payload.note]
    db.commit()
    return claim_to_contract(claim)


def _memo_envelope(db: Session, deal: DealRow) -> schemas.MemoEnvelope:
    row = latest_memo(db, deal.id)
    if row is not None:
        return schemas.MemoEnvelope(memo=schemas.Memo.model_validate(row.memo_json),
                                    generated_at=row.created_at, version=row.version)
    claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
    return schemas.MemoEnvelope(memo=schemas.Memo.model_validate(fallback_memo(deal, claims)),
                                generated_at=_now_iso(), version=1)


@router.get("/deals/{deal_id}/memo", response_model=schemas.MemoEnvelope)
def get_memo(deal_id: str, db: Session = Depends(get_db)):
    return _memo_envelope(db, _get_deal(db, deal_id))


@router.post("/deals/{deal_id}/memo/regenerate", response_model=schemas.MemoEnvelope)
async def regenerate_memo(deal_id: str, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    axes = latest_axes(db, deal.id)
    if axes is not None:
        summary = "Founder axis {}: {} | Market {}: {} | Idea-vs-market {}: {}".format(
            axes.founder_axis.get("score"), axes.founder_axis.get("summary"),
            axes.market.get("rating"), axes.market.get("summary"),
            axes.idea_vs_market.get("score"), axes.idea_vs_market.get("verdict"))
    else:
        summary = "No axis assessment available yet."
    errors = list(deal.errors or [])
    ask_line = "${:,}".format(deal.ask_usd) if deal.ask_usd else "Not disclosed"
    await generate_memo(db, deal, summary, errors, ask_line=ask_line)
    deal.errors = errors
    db.commit()
    return _memo_envelope(db, deal)


@router.get("/deals/{deal_id}/briefing", response_model=schemas.BriefingV2)
def get_briefing(deal_id: str, request: Request, db: Session = Depends(get_db)):
    """Returns the EXISTING briefing if one was generated; 404 otherwise.
    Audio persists on disk — the player survives refresh and navigation."""
    _get_deal(db, deal_id)
    row = db.get(BriefingRow, deal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="no briefing generated yet")
    url = None
    if row.audio_path:
        if not os.path.exists(os.path.join(AUDIO_DIR, os.path.basename(row.audio_path))):
            raise HTTPException(status_code=404, detail="briefing audio missing from disk")
        url = str(request.base_url).rstrip("/") + row.audio_path
    return schemas.BriefingV2(
        url=url, duration_sec=row.duration_sec or 0, generated_at=row.generated_at,
        audio_url=row.audio_path, transcript=row.transcript or "",
        chapters=[schemas.Chapter(title=c["title"], start_sec=c["startSec"])
                  for c in (row.chapters or [])])


@router.post("/deals/{deal_id}/briefing", response_model=schemas.BriefingV2)
async def briefing(deal_id: str, request: Request, db: Session = Depends(get_db)):
    """Always regenerates and replaces the stored briefing."""
    deal = _get_deal(db, deal_id)
    memo_row = latest_memo(db, deal.id)
    if memo_row is not None:
        memo, version = memo_row.memo_json, memo_row.version
    else:
        claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
        memo, version = fallback_memo(deal, claims), 1
    errors = list(deal.errors or [])
    result = await generate_briefing(deal, memo, version, errors)
    deal.errors = errors
    base = str(request.base_url).rstrip("/")
    url = None
    duration = round(len(result["transcript"].split()) / 2.6, 1)
    if result["audioUrl"]:
        url = base + result["audioUrl"]
        duration = mp3_duration_sec(
            os.path.join(AUDIO_DIR, os.path.basename(result["audioUrl"])),
            result["transcript"])
    row = db.get(BriefingRow, deal_id)
    if row is None:
        row = BriefingRow(deal_id=deal_id)
        db.add(row)
    row.audio_path = result["audioUrl"]
    row.duration_sec = duration
    row.transcript = result["transcript"]
    row.chapters = result["chapters"]
    row.generated_at = _now_iso()
    db.commit()
    return schemas.BriefingV2(
        url=url, duration_sec=duration, generated_at=row.generated_at,
        audio_url=result["audioUrl"], transcript=result["transcript"],
        chapters=[schemas.Chapter(title=c["title"], start_sec=c["startSec"])
                  for c in result["chapters"]])


@router.post("/deals/{deal_id}/simulate-application", response_model=schemas.Deal)
async def simulate_application(deal_id: str, db: Session = Depends(get_db)):
    """DEMO convergence: constructs an application from the lead's REAL public
    footprint (post text, repos) and runs the FULL inbound pipeline on the same
    deal + founder. Clearly labeled simulated — no real founder response exists."""
    deal = _get_deal(db, deal_id)
    if deal.pipeline_stage not in ("Sourced", "Invited"):
        raise HTTPException(status_code=400, detail="only outbound leads can simulate an application")
    links = db.execute(select(DealFounderRow).where(
        DealFounderRow.deal_id == deal_id)).scalars().all()
    founders = [db.get(FounderRow, l.founder_id) for l in links]
    founders = [f for f in founders if f is not None]

    parts = ["Company: {}".format(deal.company),
             "Tagline: {}".format(deal.tagline or "Not disclosed"),
             "Pitch deck: not provided",
             "Founders: " + "; ".join("{} ({})".format(f.name, f.role) for f in founders)]
    for s in db.execute(select(SignalRow).where(
            SignalRow.deal_id == deal_id)).scalars().all():
        raw = s.raw_json or {}
        if s.signal_type == "hn_post":
            parts.append("Show HN post ({} points): {}".format(raw.get("points", 0), raw.get("title", "")))
            if raw.get("story_text"):
                parts.append(raw["story_text"][:3000])
        elif s.signal_type == "github_repo_trending":
            parts.append("Trending repo '{}' ({} stars): {}".format(
                raw.get("title"), raw.get("stars"), raw.get("description") or ""))
        elif s.signal_type == "github_profile":
            for r in (raw.get("top_repos") or [])[:3]:
                parts.append("Public repo {}: {} ({} stars).".format(
                    r.get("name"), r.get("description") or "no description", r.get("stars", 0)))
    app_text = "\n".join(parts)

    record_trace(db, deal_id, "simulated-application", "",
                 "DEMO: simulated application received — constructed from the lead's real public footprint; no real founder response")
    for f in founders:
        f.contact_status = "Applied"
    errors: list = []
    await run_intelligence(db, deal, founders, app_text, None, None, errors)
    deal.next_action = "Simulated application (demo) — review three-axis scorecard."
    db.commit()
    return deal_to_contract(db, deal)


# ---- outreach: drafts + SIMULATED sends only; nothing leaves the system ----

def _latest_draft(db: Session, deal_id: str):
    return db.execute(select(OutreachDraftRow).where(OutreachDraftRow.deal_id == deal_id)
                      .order_by(OutreachDraftRow.id.desc())).scalars().first()


@router.get("/deals/{deal_id}/outreach/state", response_model=schemas.OutreachState)
def outreach_state(deal_id: str, db: Session = Depends(get_db)):
    _get_deal(db, deal_id)
    state = db.get(OutreachStateRow, deal_id)
    draft_ready = _latest_draft(db, deal_id) is not None
    if state is None:
        return schemas.OutreachState(status="not_sent", draft_ready=draft_ready)
    return schemas.OutreachState(status=state.status, sent_at=state.sent_at,
                                 channel=state.channel, draft_ready=draft_ready)


@router.get("/deals/{deal_id}/outreach/draft", response_model=schemas.OutreachDraft)
async def outreach_draft(deal_id: str, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    row = _latest_draft(db, deal_id)
    if row is None:
        link = db.execute(select(DealFounderRow).where(
            DealFounderRow.deal_id == deal_id)).scalars().first()
        founder_id = link.founder_id if link else ""
        errors: List[str] = []
        made = await draft_outreach(
            db, founder_id, deal_id,
            "{} — {} ({}, {})".format(deal.company, deal.tagline, deal.sector, deal.source),
            active_thesis(db), errors)
        if made is None:
            founder = db.get(FounderRow, founder_id) if founder_id else None
            first = (founder.name.split()[0] if founder else "there")
            made = {"subject": "Quick note on {} — from an early-stage fund".format(deal.company),
                    "body": ("Hi {},\n\nWe came across {} in our outbound scan — {} "
                             "We'd love a 20-minute intro and can send a short "
                             "application link either way.\n\n— Scopos, draft").format(
                                 first, deal.company, deal.tagline)}
            db.add(OutreachDraftRow(founder_id=founder_id or "unknown", deal_id=deal_id,
                                    draft_text=made["body"], subject=made["subject"],
                                    created_at=_now_iso()))
        db.commit()
        row = _latest_draft(db, deal_id)
    axes = latest_axes(db, deal.id)
    if axes is None:
        # LEAD: strength derives purely from the real public footprint
        strength = lead_signal_breakdown(db, deal)
    else:
        fa = axes.founder_axis
        iv_trend = (axes.idea_vs_market or {}).get("trend", "flat")
        mk_rating = (axes.market or {}).get("rating", "Neutral")
        strength = signal_strength(db, deal, fa, iv_trend, mk_rating)
    return schemas.OutreachDraft(
        subject=row.subject or "Quick note on {}".format(deal.company),
        body=row.draft_text,
        signals=[schemas.OutreachSignal(**s) for s in strength["breakdown"]],
        signal_strength=strength["strength"])


@router.post("/deals/{deal_id}/outreach/send", response_model=schemas.OutreachState)
def outreach_send(deal_id: str, payload: schemas.SendOutreachPayload,
                  db: Session = Depends(get_db)):
    """SIMULATED ONLY — records the send, advances the pipeline; no message
    ever actually leaves the system."""
    deal = _get_deal(db, deal_id)
    state = db.get(OutreachStateRow, deal_id)
    if state is None:
        state = OutreachStateRow(deal_id=deal_id)
        db.add(state)
    state.status = "sent"
    state.sent_at = _now_iso()
    state.channel = payload.channel or "Email"
    if payload.subject or payload.body:
        db.add(OutreachDraftRow(founder_id="edited", deal_id=deal_id,
                                draft_text=payload.body or "",
                                subject=payload.subject, created_at=_now_iso()))
    if deal.pipeline_stage == "Sourced":
        deal.pipeline_stage = "Invited"
        deal.stage_started_at = _now_iso()
    deal.next_action = "Awaiting response — pitch deck not yet received."
    link = db.execute(select(DealFounderRow).where(
        DealFounderRow.deal_id == deal_id)).scalars().first()
    if link:
        founder = db.get(FounderRow, link.founder_id)
        if founder and founder.contact_status in ("Discovered", "Reviewing"):
            founder.contact_status = "Contacted"
    record_trace(db, deal_id, "outreach-send", "",
                 "SIMULATED send via {} — nothing left the system".format(state.channel))
    db.commit()
    return schemas.OutreachState(status="sent", sent_at=state.sent_at,
                                 channel=state.channel, draft_ready=True)


@router.get("/deals/{deal_id}/artifacts", response_model=List[schemas.Artifact])
def list_artifacts(deal_id: str, db: Session = Depends(get_db)):
    _get_deal(db, deal_id)
    out: List[schemas.Artifact] = []
    rows = db.execute(select(SignalRow).where(SignalRow.deal_id == deal_id)).scalars().all()
    for s in rows:
        raw = s.raw_json or {}
        if s.signal_type == "deck_text":
            out.append(schemas.Artifact(id="art-{}".format(s.id), label="Pitch deck (extracted text)",
                                        kind="deck", note=(raw.get("text") or "")[:200]))
        elif s.signal_type == "cv":
            out.append(schemas.Artifact(id="art-{}".format(s.id), label="Founder CV / footprint text",
                                        kind="cv", note=(raw.get("text") or "")[:200]))
        elif s.signal_type == "application":
            video = ((raw.get("payload") or {}).get("video_pitch")
                     or (raw.get("payload") or {}).get("video_pitch_url"))
            if video:
                out.append(schemas.Artifact(id="art-{}-v".format(s.id), label="Video pitch",
                                            kind="video", note=str(video)[:200]))
    return out


@router.get("/deals/{deal_id}/trace", response_model=List[schemas.TraceItem])
def pipeline_trace(deal_id: str, db: Session = Depends(get_db)):
    _get_deal(db, deal_id)
    rows = db.execute(select(PipelineTraceRow).where(PipelineTraceRow.deal_id == deal_id)
                      .order_by(PipelineTraceRow.id)).scalars().all()
    return [schemas.TraceItem(step=r.step, model=r.model or "", summary=r.summary or "",
                              duration_ms=r.duration_ms or 0, created_at=r.created_at)
            for r in rows]
