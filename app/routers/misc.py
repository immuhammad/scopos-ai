"""Sourcing feed, applications, theses, ingest, NL search, and metrics."""
from datetime import datetime, timezone
from statistics import median
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import ClaimRow, DealFounderRow, DealRow, FounderRow, SignalRow, ThesisRow
from app.routers.deals import DECIDED_STAGES
from app.services.assemble import (deal_to_contract, founder_to_contract, hours_since,
                                   sourcing_feed)
from app.services.feedback import feedback_notes
from app.services.ingest_github import ingest_github
from app.services.ingest_hn import ingest_hn
from app.services.pipeline import process_application
from app.services.search import run_search
from app.services.slugs import unique_slug

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/sourcing", response_model=List[schemas.SourcingItem])
def list_sourcing(db: Session = Depends(get_db)):
    return sourcing_feed(db)


@router.post("/applications", response_model=schemas.ApplicationResponse)
async def submit_application(payload: schemas.ApplicationPayload,
                             db: Session = Depends(get_db)):
    if not payload.founders:
        raise HTTPException(status_code=422, detail="at least one founder is required")
    deal, matched, new_ids, errors = await process_application(db, payload)
    return schemas.ApplicationResponse(
        deal_id=deal.id, matched_founder_ids=matched, new_founder_ids=new_ids,
        deal=deal_to_contract(db, deal) if deal.viable else None,
        viable=bool(deal.viable),
        filter_reason=None if deal.viable else deal.filter_reason,
        errors=errors)


# ---- theses (frontend singular shape + ownership target + feedback loop) ----

def _thesis_v2(t: ThesisRow) -> schemas.ThesisV2:
    risk = t.risk if t.risk in ("Conservative", "Balanced", "Aggressive") else "Balanced"
    return schemas.ThesisV2(
        id=t.id, name=t.name,
        sector=t.sector or (t.sectors[0] if t.sectors else "All Sectors"),
        stage=t.stage or "All Stages",
        geography=t.geo or (t.geography[0] if t.geography else "Global"),
        risk=risk, check_size=t.check_size or t.check_size_usd or 100000,
        excluded_sectors=list(t.excluded_sectors or []),
        created_at=t.created_at or _now_iso(),
        ownership_target_pct=t.ownership_target_pct if t.ownership_target_pct is not None else 10.0,
        active=bool(t.active))


@router.get("/theses", response_model=List[schemas.ThesisV2])
def list_theses(db: Session = Depends(get_db)):
    return [_thesis_v2(t) for t in db.execute(select(ThesisRow)).scalars().all()]


@router.get("/theses/active", response_model=schemas.ThesisV2)
def get_active_thesis(db: Session = Depends(get_db)):
    row = db.execute(select(ThesisRow).where(ThesisRow.active.is_(True))).scalars().first()
    if row is None:
        row = db.execute(select(ThesisRow)).scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="no theses defined")
    return _thesis_v2(row)


@router.post("/theses", response_model=schemas.ThesisV2)
def save_thesis(payload: schemas.ThesisV2Payload, db: Session = Depends(get_db)):
    row = db.get(ThesisRow, payload.id) if payload.id else None
    if row is None:
        row = ThesisRow(id=payload.id or unique_slug(db, ThesisRow, payload.name),
                        created_at=_now_iso())
        db.add(row)
    row.name = payload.name
    row.sector = payload.sector
    row.stage = payload.stage
    row.geo = payload.geography
    row.risk = payload.risk
    row.check_size = payload.check_size
    row.excluded_sectors = payload.excluded_sectors
    row.ownership_target_pct = payload.ownership_target_pct
    # keep legacy columns coherent
    row.sectors = [payload.sector] if payload.sector != "All Sectors" else []
    row.geography = [payload.geography] if payload.geography != "Global" else []
    row.check_size_usd = payload.check_size
    if payload.active:
        for other in db.execute(select(ThesisRow)).scalars().all():
            other.active = False
        row.active = True
    db.commit()
    return _thesis_v2(row)


@router.post("/theses/{thesis_id}/activate", response_model=List[schemas.ThesisV2])
def activate_thesis(thesis_id: str, db: Session = Depends(get_db)):
    target = db.get(ThesisRow, thesis_id)
    if target is None:
        raise HTTPException(status_code=404, detail="thesis not found")
    for t in db.execute(select(ThesisRow)).scalars().all():
        t.active = (t.id == thesis_id)
    db.commit()
    return list_theses(db)


@router.get("/theses/{thesis_id}/feedback", response_model=List[schemas.FeedbackNote])
def thesis_feedback(thesis_id: str, db: Session = Depends(get_db)):
    if db.get(ThesisRow, thesis_id) is None:
        raise HTTPException(status_code=404, detail="thesis not found")
    return [schemas.FeedbackNote(**n) for n in feedback_notes(db, thesis_id, limit=20)]


# ---- ingest: returns the created entities, contract-shaped ----

def _ingest_entities(db: Session, result: dict) -> schemas.IngestEntities:
    founders = [db.get(FounderRow, fid) for fid in result.get("founderIds", [])]
    deals = [db.get(DealRow, did) for did in result.get("dealIds", [])]
    signals = []
    for sid in result.get("signalIds", []):
        s = db.get(SignalRow, sid)
        if s is not None:
            raw = s.raw_json or {}
            signals.append(schemas.SourcingItem(
                id="sig-{}".format(s.id), time="now", source=s.source,
                text=raw.get("text") or raw.get("title") or ""))
    return schemas.IngestEntities(
        signals=signals,
        founders=[founder_to_contract(db, f) for f in founders if f is not None],
        deals=[deal_to_contract(db, d) for d in deals if d is not None],
        skipped=result.get("skipped", 0), errors=result.get("errors", []))


@router.post("/ingest/hn", response_model=schemas.IngestEntities)
async def ingest_hn_endpoint(limit: int = Query(default=5, ge=0, le=40),
                             db: Session = Depends(get_db)):
    return _ingest_entities(db, await ingest_hn(db, process_limit=limit))


@router.post("/ingest/github", response_model=schemas.IngestEntities)
async def ingest_github_endpoint(limit: int = Query(default=5, ge=0, le=15),
                                 db: Session = Depends(get_db)):
    return _ingest_entities(db, await ingest_github(db, process_limit=limit))


# ---- NL search: full objects with match/why/missing ----

@router.post("/search", response_model=schemas.SearchResponseV2)
async def search(payload: schemas.SearchPayload, db: Session = Depends(get_db)):
    result = await run_search(db, payload.query)
    deal_hits = []
    for h in result["deals"]:
        row = db.get(DealRow, h["id"])
        if row is not None:
            deal_hits.append(schemas.SearchDealHitV2(
                deal=deal_to_contract(db, row), match=h["matchPct"],
                why=h["why"], missing=h["missing"]))
    founder_hits = []
    for h in result["founders"]:
        row = db.get(FounderRow, h["id"])
        if row is not None:
            founder_hits.append(schemas.SearchFounderHitV2(
                founder=founder_to_contract(db, row), match=h["matchPct"], why=h["why"]))
    return schemas.SearchResponseV2(
        criteria=schemas.NLCriteria.model_validate(result["criteria"]),
        deals=deal_hits, founders=founder_hits)


# ---- speed / quality metrics for the dashboard hero strip ----

@router.get("/metrics/summary", response_model=schemas.MetricsSummary)
def metrics_summary(db: Session = Depends(get_db)):
    deals = db.execute(select(DealRow).where(DealRow.viable.is_(True))).scalars().all()
    pending = [d for d in deals if d.pipeline_stage not in DECIDED_STAGES]
    decided = [d for d in deals if d.pipeline_stage in DECIDED_STAGES]
    durations = []
    for d in decided:
        if d.first_signal_at and d.decided_at:
            h = hours_since(d.first_signal_at) - hours_since(d.decided_at)
            if h >= 0:
                durations.append(h)
    contradictions = len(db.execute(select(ClaimRow).where(
        ClaimRow.status == "contradicted")).scalars().all())
    cold = len([d for d in deals if d.is_cold_start])
    real_sourced = 0
    for d in deals:
        link = db.execute(select(DealFounderRow).where(
            DealFounderRow.deal_id == d.id)).scalars().first()
        if link:
            f = db.get(FounderRow, link.founder_id)
            if f and f.email.endswith(".invalid"):  # synthetic dedup key = genuinely ingested
                real_sourced += 1
    return schemas.MetricsSummary(
        pending_count=len(pending), decided_count=len(decided),
        median_signal_to_decision_hours=round(median(durations), 1) if durations else None,
        contradictions_caught=contradictions, cold_start_count=cold,
        real_sourced_count=real_sourced)
