"""Decline-feedback loop: investor decisions that diverge from the pipeline's
read are stored as thesis-linked signals and injected into future scoring so
Memory sharpens — stated preferences weigh in, but never override evidence."""
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SignalRow, ThesisRow


def store_feedback(db: Session, deal_id: str, decision: str, note: str,
                   thesis: Optional[ThesisRow]) -> None:
    db.add(SignalRow(
        deal_id=deal_id, source="Investor decision", signal_type="investor_feedback",
        raw_json={"decision": decision, "note": note,
                  "thesisId": thesis.id if thesis else None},
        fetched_at=datetime.now(timezone.utc).isoformat()))


def feedback_notes(db: Session, thesis_id: Optional[str], limit: int = 5) -> List[dict]:
    rows = db.execute(
        select(SignalRow).where(SignalRow.signal_type == "investor_feedback")
        .order_by(SignalRow.id.desc())).scalars().all()
    out = []
    for s in rows:
        raw = s.raw_json or {}
        if thesis_id is None or raw.get("thesisId") == thesis_id:
            out.append({"dealId": s.deal_id, "decision": raw.get("decision"),
                        "note": raw.get("note"), "at": s.fetched_at})
        if len(out) >= limit:
            break
    return out


def feedback_context(db: Session, thesis: Optional[ThesisRow]) -> str:
    """Compact context block for axis/memo prompts; empty string when no history."""
    notes = feedback_notes(db, thesis.id if thesis else None)
    if not notes:
        return ""
    lines = "\n".join("- [{}] {}".format(n["decision"], (n["note"] or "")[:200]) for n in notes)
    return ("\nINVESTOR FEEDBACK HISTORY (for the active thesis — weigh these stated "
            "preferences when relevant; do NOT override evidence):\n" + lines + "\n")
