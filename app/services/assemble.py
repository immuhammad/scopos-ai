"""Assembles DB rows into contract-exact Pydantic responses. All shape
guarantees (camelCase, enums, market axis without numeric score) live in
app.schemas — this module just feeds it."""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.models import (AuditTrailRow, AxisAssessmentRow, ClaimRow, DealFounderRow,
                        DealRow, FounderRow, MemoRow, SignalRow)
from app.services.memo import fallback_memo

VALID_ROLES = {"CEO", "CTO", "COO", "CPO"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hours_since(iso: Optional[str]) -> float:
    if not iso:
        return 0.0
    try:
        started = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        return round(max(0.0, (_now() - started).total_seconds() / 3600.0), 1)
    except ValueError:
        return 0.0


def latest_axes(db: Session, deal_id: str) -> Optional[AxisAssessmentRow]:
    return db.execute(
        select(AxisAssessmentRow).where(AxisAssessmentRow.deal_id == deal_id)
        .order_by(AxisAssessmentRow.version.desc())).scalars().first()


def latest_memo(db: Session, deal_id: str) -> Optional[MemoRow]:
    return db.execute(
        select(MemoRow).where(MemoRow.deal_id == deal_id)
        .order_by(MemoRow.version.desc())).scalars().first()


def claim_to_contract(c: ClaimRow) -> schemas.Claim:
    return schemas.Claim(
        id=c.id, claim=c.claim, status=c.status, trust_score=c.trust_score,
        detail=c.detail or "", source=c.source, source_url=c.source_url,
        collected_at=c.collected_at, verified_at=c.verified_at,
        conflicting_evidence=c.conflicting_evidence,
        ai_explanation=c.ai_explanation or "",
        review_notes=list(c.review_notes or []))


def deal_to_contract(db: Session, deal: DealRow) -> schemas.Deal:
    links = db.execute(
        select(DealFounderRow).where(DealFounderRow.deal_id == deal.id)
        .order_by(DealFounderRow.lead.desc(), DealFounderRow.id)).scalars().all()
    founder_ids = [l.founder_id for l in links]

    axes = latest_axes(db, deal.id)
    if axes is not None:
        founder_axis = schemas.FounderAxis(**axes.founder_axis)
        market = schemas.MarketAxis(**axes.market)
        idea = schemas.IdeaVsMarketAxis(**axes.idea_vs_market)
        coverage = [schemas.TeamCoverageItem(**c) for c in (axes.team_coverage or [])]
    else:
        founder_axis = schemas.FounderAxis(
            score=50, trend="flat", summary="Assessment pending.",
            note="Three-axis assessment has not run yet.")
        market = schemas.MarketAxis(rating="Neutral", trend="flat", tam="Not disclosed",
                                    summary="Assessment pending.", competitors=[])
        idea = schemas.IdeaVsMarketAxis(score=50, trend="flat",
                                        verdict="Assessment pending.", flexibility="Not assessed.")
        coverage = [schemas.TeamCoverageItem(area=a, rating="Unknown")
                    for a in ("Product", "Engineering", "AI / domain", "Enterprise sales",
                              "Marketing", "Finance", "Operations")]

    memo_row = latest_memo(db, deal.id)
    claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)
                        .order_by(ClaimRow.id)).scalars().all()
    memo_json = memo_row.memo_json if memo_row else fallback_memo(deal, claims)

    audit = db.execute(select(AuditTrailRow).where(AuditTrailRow.deal_id == deal.id)
                       .order_by(AuditTrailRow.id)).scalars().all()

    return schemas.Deal(
        id=deal.id, company=deal.company, tagline=deal.tagline or "",
        sector=deal.sector or "Not disclosed", stage=deal.stage or "Not disclosed",
        geography=deal.geography or "Not disclosed", source=deal.source,
        is_cold_start=bool(deal.is_cold_start) if deal.is_cold_start else None,
        pipeline_stage=deal.pipeline_stage,
        time_in_stage_hours=hours_since(deal.stage_started_at),
        next_action=deal.next_action or "", founder_ids=founder_ids,
        founder_axis=founder_axis, market=market, idea_vs_market=idea,
        team_coverage=coverage, verifications=deal.verifications or 0,
        alerts=deal.alerts or 0,
        links=[schemas.DealLink(label=l.get("label", "Link"), href=l.get("href"))
               for l in (deal.links or [])],
        claims=[claim_to_contract(c) for c in claims],
        memo=schemas.Memo.model_validate(memo_json),
        ask_usd=deal.ask_usd or 100000, created_at=deal.created_at,
        decision_deadline=deal.decision_deadline,
        starred=bool(deal.starred) if deal.starred else None,
        audit_trail=[schemas.AuditEntry(decision=a.decision, note=a.note,
                                        conditions=a.conditions, timestamp=a.timestamp)
                     for a in audit] or None,
        errors=list(deal.errors) if deal.errors else None,
        first_signal_at=deal.first_signal_at,
        decided_at=deal.decided_at,
        signal_to_decision_hours=(
            round(hours_since(deal.first_signal_at) - hours_since(deal.decided_at), 1)
            if deal.first_signal_at and deal.decided_at else None))


def founder_to_contract(db: Session, f: FounderRow) -> schemas.Founder:
    project_links = db.execute(
        select(DealFounderRow).where(DealFounderRow.founder_id == f.id)
        .order_by(DealFounderRow.id)).scalars().all()
    return schemas.Founder(
        id=f.id, name=f.name,
        role=f.role if f.role in VALID_ROLES else "Other",
        email=f.email, linkedin=f.linkedin, github=f.github, website=f.website,
        location=f.location or "Not disclosed", expertise=list(f.expertise or []),
        founder_score=f.founder_score or 0, score_trend=f.score_trend or "flat",
        components=[schemas.FounderComponent(**c) for c in (f.components or [])],
        history=[schemas.FounderEvent(**h) for h in (f.history or [])],
        projects=[l.deal_id for l in project_links],
        contact_status=f.contact_status or "Applied",
        contradiction_count=f.contradiction_count or 0, bio=f.bio or "")


def _humanize_age(iso: str) -> str:
    hours = hours_since(iso)
    if hours < 1:
        return "{}m".format(max(1, int(hours * 60)))
    if hours < 24:
        return "{}h".format(int(hours))
    return "{}d".format(int(hours / 24))


FEED_TYPES = ("feed", "hn_post", "launch", "github_repo_trending", "application")


def sourcing_feed(db: Session, limit: int = 40) -> List[schemas.SourcingItem]:
    rows = db.execute(
        select(SignalRow).where(SignalRow.signal_type.in_(FEED_TYPES))
        .order_by(SignalRow.id.desc()).limit(limit)).scalars().all()
    items = []
    for s in rows:
        raw = s.raw_json or {}
        text = raw.get("text") or raw.get("title") or "{} signal".format(s.source)
        items.append(schemas.SourcingItem(
            id="sig-{}".format(s.id), time=raw.get("time") or _humanize_age(s.fetched_at),
            source=s.source, text=text))
    return items
