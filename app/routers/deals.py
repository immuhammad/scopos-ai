from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import AuditTrailRow, ClaimRow, DealRow
from app.services.assemble import (claim_to_contract, deal_to_contract, latest_axes,
                                   latest_memo)
from app.services.briefing import generate_briefing
from app.services.memo import generate_memo

router = APIRouter()

_DECISION_STAGE = {
    "approve": "Approved",
    "approve_with_conditions": "Approved",
    "continue_diligence": "Diligence",
    "decline": "Declined",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_deal(db: Session, deal_id: str) -> DealRow:
    deal = db.get(DealRow, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="deal not found")
    return deal


@router.get("/deals", response_model=List[schemas.Deal])
def list_deals(db: Session = Depends(get_db)):
    rows = db.execute(select(DealRow).where(DealRow.viable.is_(True))).scalars().all()
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


@router.post("/deals/{deal_id}/decide", response_model=schemas.Deal)
def decide_deal(deal_id: str, payload: schemas.DecidePayload, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    deal.pipeline_stage = _DECISION_STAGE[payload.decision]
    deal.stage_started_at = _now_iso()
    deal.next_action = "Simulated decision recorded: {}{}. {}".format(
        payload.decision.replace("_", " "),
        " — conditions: {}".format(payload.conditions) if payload.conditions else "",
        "This decision is simulated — no external action was taken.")
    db.add(AuditTrailRow(deal_id=deal.id, decision=payload.decision,
                         note=payload.note, conditions=payload.conditions,
                         timestamp=_now_iso()))
    db.commit()
    return deal_to_contract(db, deal)


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


@router.get("/deals/{deal_id}/memo", response_model=schemas.Memo)
def get_memo(deal_id: str, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    row = latest_memo(db, deal.id)
    if row is not None:
        return schemas.Memo.model_validate(row.memo_json)
    from app.services.memo import fallback_memo
    claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
    return schemas.Memo.model_validate(fallback_memo(deal, claims))


@router.post("/deals/{deal_id}/memo/regenerate", response_model=schemas.Memo)
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
    memo = await generate_memo(db, deal, summary, errors)
    deal.errors = errors
    db.commit()
    return schemas.Memo.model_validate(memo)


@router.post("/deals/{deal_id}/briefing", response_model=schemas.BriefingResponse)
async def briefing(deal_id: str, db: Session = Depends(get_db)):
    deal = _get_deal(db, deal_id)
    memo_row = latest_memo(db, deal.id)
    if memo_row is not None:
        memo, version = memo_row.memo_json, memo_row.version
    else:
        from app.services.memo import fallback_memo
        claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
        memo, version = fallback_memo(deal, claims), 1
    errors = list(deal.errors or [])
    result = await generate_briefing(deal, memo, version, errors)
    deal.errors = errors
    db.commit()
    return schemas.BriefingResponse(
        audio_url=result["audioUrl"], transcript=result["transcript"],
        chapters=[schemas.Chapter(title=c["title"], start_sec=c["startSec"])
                  for c in result["chapters"]])
