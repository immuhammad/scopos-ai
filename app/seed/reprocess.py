"""Reprocess every deal through the REAL quote-anchored pipeline while
preserving deal ids, founder ids, founder scores, and history — same
recognizable companies, 100% genuine AI outputs. Run:
    python -m app.seed.reprocess            # all deals
    python -m app.seed.reprocess helix ...  # specific ids
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import (AxisAssessmentRow, ClaimRow, DealFounderRow, DealRow,
                        FounderRow, MemoRow, PipelineTraceRow, SignalRow)
from app.services.pipeline import run_intelligence

MOCKS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mocks.json")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mock_texts(mock: dict):
    """Rebuild deck/artifact text from a hand-written mock deal so extraction can
    QUOTE it. Conflicting evidence goes into a separate 'artifact scan' text so
    contradictions are CAUGHT by the checker, never scripted."""
    deck_lines = [mock["tagline"]]
    deck_lines.append(mock["memo"]["problemProduct"])
    for c in mock["claims"]:
        deck_lines.append(c["claim"].rstrip(".") + ".")
    # NOTE: mock memo traction lines are deliberately NOT included — they carry
    # meta-commentary ("Not Disclosed", "(contradicted)") that would make the
    # reconstructed deck self-contradictory and poison the checker.
    artifact_lines = []
    for c in mock["claims"]:
        if c.get("conflictingEvidence"):
            artifact_lines.append(c["conflictingEvidence"].rstrip(".") + ".")
    artifact_text = None
    if artifact_lines:
        # labeled as third-party evidence so claim extraction (founder-asserted
        # only) skips it while the contradiction checker can still quote it
        artifact_text = ("LIVE ARTIFACT SCAN (third-party evidence collected by the "
                         "platform — these are NOT founder statements):\n"
                         + "\n".join(artifact_lines))
    return "\n".join(deck_lines), artifact_text


def _stored_texts(db, deal_id: str):
    app_line, deck, cv = None, None, None
    for s in db.execute(select(SignalRow).where(SignalRow.deal_id == deal_id)).scalars().all():
        raw = s.raw_json or {}
        if s.signal_type == "application" and raw.get("payload"):
            p = raw["payload"]
            app_line = "\n".join(filter(None, [
                "Company: {}".format(p.get("company")),
                "Tagline: {}".format(p.get("tagline") or "Not disclosed"),
                "Sector: {} | Stage: {} | Geography: {}".format(
                    p.get("sector") or "Not disclosed", p.get("stage") or "Not disclosed",
                    p.get("geography") or "Not disclosed"),
                "Founders: " + "; ".join("{} ({})".format(f.get("name"), f.get("role"))
                                          for f in (p.get("founders") or [])),
            ]))
            cv = cv or p.get("cv_text") or p.get("cvText")
        elif s.signal_type == "deck_text":
            deck = raw.get("text")
        elif s.signal_type == "cv":
            cv = raw.get("text") or cv
    return app_line, deck, cv


def _ensure_signal(db, deal_id: str, signal_type: str, text: str, source: str) -> None:
    for s in db.execute(select(SignalRow).where(
            SignalRow.deal_id == deal_id,
            SignalRow.signal_type == signal_type)).scalars().all():
        if (s.raw_json or {}).get("text") == text:
            return
    db.add(SignalRow(deal_id=deal_id, source=source, signal_type=signal_type,
                     raw_json={"text": text}, fetched_at=_now_iso()))


async def reprocess_deal(db, deal: DealRow, mocks_by_id: dict) -> dict:
    links = db.execute(select(DealFounderRow).where(
        DealFounderRow.deal_id == deal.id)).scalars().all()
    founders = [db.get(FounderRow, l.founder_id) for l in links]
    founders = [f for f in founders if f is not None]

    mock = mocks_by_id.get(deal.id)
    if mock is not None:
        deck_text, artifact_text = _mock_texts(mock)
        cv_text = artifact_text  # conflicting-artifact text rides the cv/artifact slot
        app_text = "Company: {}\nTagline: {}\nSector: {} | Stage: {} | Geography: {}\nFounders: {}".format(
            deal.company, deal.tagline, deal.sector, deal.stage, deal.geography,
            "; ".join("{} ({})".format(f.name, f.role) for f in founders))
        _ensure_signal(db, deal.id, "deck_text", deck_text, "Reprocess (from demo deck)")
        if artifact_text:
            _ensure_signal(db, deal.id, "cv", artifact_text, "Live artifact scan")
    else:
        app_text, deck_text, cv_text = _stored_texts(db, deal.id)
        if app_text is None:
            app_text = "Company: {}\nTagline: {}".format(deal.company, deal.tagline)
        if deck_text:
            _ensure_signal(db, deal.id, "deck_text", deck_text, "Reprocess")

    # wipe generated intelligence — keep deal, founders, links, signals, audit
    for model in (ClaimRow, AxisAssessmentRow, MemoRow, PipelineTraceRow):
        for row in db.execute(select(model).where(model.deal_id == deal.id)).scalars().all():
            db.delete(row)
    db.flush()

    original_stage = deal.pipeline_stage
    errors = []
    await run_intelligence(db, deal, founders, app_text, deck_text, cv_text, errors,
                           restore_stage=original_stage, recompute_scores=False)
    claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
    return {"id": deal.id, "claims": len(claims),
            "contradicted": sum(1 for c in claims if c.status == "contradicted"),
            "verified": sum(1 for c in claims if c.status == "verified"),
            "errors": len(errors)}


async def main(only_ids):
    init_db()
    with open(MOCKS_PATH) as fh:
        mocks_by_id = {d["id"]: d for d in json.load(fh)["DEALS"]}
    db = SessionLocal()
    try:
        deals = db.execute(select(DealRow).where(DealRow.viable.is_(True))).scalars().all()
        if only_ids:
            deals = [d for d in deals if d.id in only_ids]
        print("Reprocessing {} deals through the quote-anchored pipeline...".format(len(deals)))
        for deal in deals:
            res = await reprocess_deal(db, deal, mocks_by_id)
            print("  {id}: {claims} claims ({verified} verified, {contradicted} contradicted), "
                  "{errors} degraded calls".format(**res))
    finally:
        db.close()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main(set(sys.argv[1:])))
