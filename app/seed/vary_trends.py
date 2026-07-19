"""Trend variety through REAL reassessment — never hardcoded.

For chosen deals, attach a follow-up artifact (traction update / weakening
note / nothing material), then re-run the three-axis assessment so a version 2
exists and trend derivation compares real versions.
    python -m app.seed.vary_trends
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import ClaimRow, DealFounderRow, DealRow, FounderRow, SignalRow
from app.services.axes import assess_axes
from app.services.pipeline import active_thesis
from app.services.trace import record_trace

UPDATES = {
    "helix-runtime": ("Traction update (new artifact): signed a $250K expansion contract with the "
                      "Fortune-500 design partner; two additional pilots converted to paid; "
                      "OSS stars grew 2,100 in 30 days."),
    "polyglot-ai": ("Traction update (new artifact): closed 3 enterprise contact-center pilots; "
                    "latency benchmark now beats the incumbent by 40%; hired a staff engineer "
                    "from Deepgram."),
    "quantex-health": ("Weakening update (new artifact): the claimed advisor publicly clarified "
                       "they are not engaged; the private beta waitlist shrank; a competing "
                       "RCM startup announced a $30M Series B targeting the same clinics."),
    "northgrid": ("Weakening update (new artifact): Stripe connector shows a further MRR decline "
                  "this month; two of the six verified customers churned; the SOC 2 audit "
                  "remains unscheduled."),
    "brickline": ("Routine update (new artifact): no material change — the team continues pilot "
                  "conversations; no new contracts or churn reported."),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        thesis = active_thesis(db)
        for deal_id, artifact in UPDATES.items():
            deal = db.get(DealRow, deal_id)
            if deal is None:
                print("  skip {} (not in DB)".format(deal_id))
                continue
            db.add(SignalRow(deal_id=deal_id, source="Follow-up artifact",
                             signal_type="artifact_update", raw_json={"text": artifact},
                             fetched_at=_now_iso()))
            db.flush()
            links = db.execute(select(DealFounderRow).where(
                DealFounderRow.deal_id == deal_id)).scalars().all()
            founders = [db.get(FounderRow, l.founder_id) for l in links]
            founders = [f for f in founders if f is not None]
            claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal_id)).scalars().all()
            claims_text = "\n".join("- [{}] {}".format(c.status, c.claim) for c in claims) \
                or "No claims recorded."
            evidence = "FOLLOW-UP ARTIFACT (newest evidence):\n{}\n\nOriginal tagline: {}".format(
                artifact, deal.tagline)
            fa, mk, iv, _ = await assess_axes(db, deal, founders, claims_text, evidence,
                                              thesis, [], cold_start_note=None)
            record_trace(db, deal_id, "reassessment", "gpt-4o",
                         "Follow-up artifact assessed — trends now derive from version comparison")
            db.commit()
            print("  {}: founder {} ({}) · market {} ({}) · idea {} ({})".format(
                deal_id, fa["score"], fa["trend"], mk["rating"], mk["trend"],
                iv["score"], iv["trend"]))
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
