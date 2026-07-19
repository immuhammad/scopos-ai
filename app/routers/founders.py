from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.models import FounderRow
from app.services.assemble import founder_to_contract

router = APIRouter()


@router.get("/founders", response_model=List[schemas.Founder])
def list_founders(db: Session = Depends(get_db)):
    rows = db.execute(select(FounderRow)).scalars().all()
    return [founder_to_contract(db, f) for f in rows]


@router.get("/founders/{founder_id}", response_model=schemas.Founder)
def get_founder(founder_id: str, db: Session = Depends(get_db)):
    row = db.get(FounderRow, founder_id)
    if row is None:
        raise HTTPException(status_code=404, detail="founder not found")
    return founder_to_contract(db, row)


@router.post("/founders/{founder_id}/contact-status", response_model=schemas.Founder)
def set_contact_status(founder_id: str, payload: schemas.ContactStatusPayload,
                       db: Session = Depends(get_db)):
    row = db.get(FounderRow, founder_id)
    if row is None:
        raise HTTPException(status_code=404, detail="founder not found")
    row.contact_status = payload.status
    db.commit()
    return founder_to_contract(db, row)
