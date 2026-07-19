from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate()


_NEW_COLUMNS = [
    ("deals", "first_signal_at", "TEXT"),
    ("deals", "decided_at", "TEXT"),
    ("claims", "source_quote", "TEXT"),
    ("claims", "artifact", "TEXT"),
    ("audit_trail", "actor", "TEXT DEFAULT 'Analyst'"),
    ("audit_trail", "analysis_label", "TEXT DEFAULT ''"),
    ("theses", "sector", "TEXT DEFAULT 'All Sectors'"),
    ("theses", "geo", "TEXT DEFAULT 'Global'"),
    ("theses", "check_size", "INTEGER DEFAULT 100000"),
    ("theses", "created_at", "TEXT"),
    ("theses", "ownership_target_pct", "REAL DEFAULT 10.0"),
    ("outreach_drafts", "subject", "TEXT"),
]

_RISK_MAP = {"Moderate": "Balanced", "High": "Aggressive", "Low": "Conservative"}


def _migrate():
    """Idempotent SQLite migration: add new columns, convert legacy thesis rows
    (plural sectors/geography arrays) to the frontend's singular shape."""
    from datetime import datetime, timezone
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table, col, decl in _NEW_COLUMNS:
            if table in insp.get_table_names():
                existing = {c["name"] for c in insp.get_columns(table)}
                if col not in existing:
                    conn.execute(text('ALTER TABLE {} ADD COLUMN {} {}'.format(table, col, decl)))

    from app.models import DealRow, SignalRow, ThesisRow
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).isoformat()
        for t in db.query(ThesisRow).all():
            if not t.created_at:
                t.created_at = now
            if t.risk in _RISK_MAP:
                t.risk = _RISK_MAP[t.risk]
            if (t.sector or "All Sectors") == "All Sectors" and t.sectors:
                t.sector = t.sectors[0]
            if (t.geo or "Global") == "Global" and t.geography:
                t.geo = t.geography[0]
            if t.check_size in (None, 100000) and t.check_size_usd:
                t.check_size = t.check_size_usd
            if t.ownership_target_pct is None:
                t.ownership_target_pct = 10.0
        for d in db.query(DealRow).filter(DealRow.first_signal_at.is_(None)).all():
            first = (db.query(SignalRow).filter(SignalRow.deal_id == d.id)
                     .order_by(SignalRow.fetched_at).first())
            d.first_signal_at = first.fetched_at if first else d.created_at
        db.commit()
    finally:
        db.close()
