"""Agentic traceability: record one line per pipeline step per deal."""
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import PipelineTraceRow


def record_trace(db: Session, deal_id: str, step: str, model: str, summary: str,
                 duration_ms: int = 0) -> None:
    db.add(PipelineTraceRow(
        deal_id=deal_id, step=step, model=model or "",
        summary=(summary or "")[:300], duration_ms=duration_ms,
        created_at=datetime.now(timezone.utc).isoformat()))


@contextmanager
def traced(db: Session, deal_id: str, step: str, model: str = ""):
    """Usage: with traced(db, deal_id, "extraction", MODEL_MINI) as t: ...; t["summary"] = "..."""
    t0 = time.time()
    holder = {"summary": ""}
    try:
        yield holder
    finally:
        record_trace(db, deal_id, step, model, holder["summary"],
                     int((time.time() - t0) * 1000))
