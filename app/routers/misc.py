"""Sourcing feed, applications, theses, ingest, and NL search endpoints."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import ThesisRow
from app.services.assemble import deal_to_contract, sourcing_feed
from app.services.ingest_github import ingest_github
from app.services.ingest_hn import ingest_hn
from app.services.pipeline import process_application
from app.services.search import run_search
from app.services.slugs import unique_slug

router = APIRouter()


@router.get("/sourcing", response_model=List[schemas.SourcingItem])
def list_sourcing(db: Session = Depends(get_db)):
    return sourcing_feed(db)


@router.post("/applications", response_model=schemas.ApplicationResponse)
async def submit_application(payload: schemas.ApplicationPayload,
                             db: Session = Depends(get_db)):
    if not payload.founders:
        raise HTTPException(status_code=422, detail="at least one founder is required")
    deal, matched, errors = await process_application(db, payload)
    return schemas.ApplicationResponse(
        deal_id=deal.id, matched_founder_ids=matched,
        deal=deal_to_contract(db, deal) if deal.viable else None,
        viable=bool(deal.viable), errors=errors)


@router.get("/theses", response_model=List[schemas.Thesis])
def list_theses(db: Session = Depends(get_db)):
    rows = db.execute(select(ThesisRow)).scalars().all()
    return [schemas.Thesis(id=t.id, name=t.name, sectors=t.sectors or [],
                           stage=t.stage, geography=t.geography or [], risk=t.risk,
                           check_size_usd=t.check_size_usd,
                           excluded_sectors=t.excluded_sectors or [], active=t.active)
            for t in rows]


@router.post("/theses", response_model=schemas.Thesis)
def save_thesis(payload: schemas.ThesisPayload, db: Session = Depends(get_db)):
    row = db.get(ThesisRow, payload.id) if payload.id else None
    if row is None:
        row = ThesisRow(id=payload.id or unique_slug(db, ThesisRow, payload.name))
        db.add(row)
    row.name = payload.name
    row.sectors = payload.sectors
    row.stage = payload.stage
    row.geography = payload.geography
    row.risk = payload.risk
    row.check_size_usd = payload.check_size_usd
    row.excluded_sectors = payload.excluded_sectors
    if payload.active:
        for other in db.execute(select(ThesisRow)).scalars().all():
            other.active = False
        row.active = True
    db.commit()
    return schemas.Thesis(id=row.id, name=row.name, sectors=row.sectors or [],
                          stage=row.stage, geography=row.geography or [], risk=row.risk,
                          check_size_usd=row.check_size_usd,
                          excluded_sectors=row.excluded_sectors or [], active=row.active)


@router.post("/theses/{thesis_id}/activate", response_model=List[schemas.Thesis])
def activate_thesis(thesis_id: str, db: Session = Depends(get_db)):
    target = db.get(ThesisRow, thesis_id)
    if target is None:
        raise HTTPException(status_code=404, detail="thesis not found")
    for t in db.execute(select(ThesisRow)).scalars().all():
        t.active = (t.id == thesis_id)
    db.commit()
    return list_theses(db)


@router.post("/ingest/hn", response_model=schemas.IngestResponse)
async def ingest_hn_endpoint(limit: int = Query(default=5, ge=0, le=40),
                             db: Session = Depends(get_db)):
    return schemas.IngestResponse(**{
        "new_signals": 0, "new_founders": 0, "new_deals": 0,
        **_camel_to_snake_ingest(await ingest_hn(db, process_limit=limit))})


@router.post("/ingest/github", response_model=schemas.IngestResponse)
async def ingest_github_endpoint(limit: int = Query(default=5, ge=0, le=15),
                                 db: Session = Depends(get_db)):
    return schemas.IngestResponse(**{
        "new_signals": 0, "new_founders": 0, "new_deals": 0,
        **_camel_to_snake_ingest(await ingest_github(db, process_limit=limit))})


def _camel_to_snake_ingest(result: dict) -> dict:
    return {"new_signals": result.get("newSignals", 0),
            "new_founders": result.get("newFounders", 0),
            "new_deals": result.get("newDeals", 0),
            "skipped": result.get("skipped", 0),
            "errors": result.get("errors", [])}


@router.post("/search", response_model=schemas.SearchResponse)
async def search(payload: schemas.SearchPayload, db: Session = Depends(get_db)):
    result = await run_search(db, payload.query)
    return schemas.SearchResponse(
        criteria=result["criteria"],
        deals=[schemas.SearchDealHit(id=h["id"], match_pct=h["matchPct"],
                                     why=h["why"], missing=h["missing"])
               for h in result["deals"]],
        founders=[schemas.SearchFounderHit(id=h["id"], match_pct=h["matchPct"],
                                           why=h["why"])
                  for h in result["founders"]])
