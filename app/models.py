from sqlalchemy import Boolean, Column, Float, Integer, JSON, String, Text
from sqlalchemy.orm import mapped_column

from app.db import Base


class FounderRow(Base):
    __tablename__ = "founders"
    id = mapped_column(String, primary_key=True)
    name = mapped_column(String, nullable=False)
    role = mapped_column(String, default="Other")
    email = mapped_column(String, nullable=False, index=True)
    linkedin = mapped_column(String, nullable=True)
    github = mapped_column(String, nullable=True)
    website = mapped_column(String, nullable=True)
    location = mapped_column(String, default="Not disclosed")
    expertise = mapped_column(JSON, default=list)
    founder_score = mapped_column(Integer, default=0)
    score_trend = mapped_column(String, default="flat")
    components = mapped_column(JSON, default=list)
    history = mapped_column(JSON, default=list)
    contact_status = mapped_column(String, default="Applied")
    contradiction_count = mapped_column(Integer, default=0)
    bio = mapped_column(Text, default="")
    created_at = mapped_column(String, nullable=False)


class DealRow(Base):
    __tablename__ = "deals"
    id = mapped_column(String, primary_key=True)
    company = mapped_column(String, nullable=False)
    tagline = mapped_column(Text, default="")
    sector = mapped_column(String, default="Not disclosed")
    stage = mapped_column(String, default="Not disclosed")
    geography = mapped_column(String, default="Not disclosed")
    source = mapped_column(String, default="Inbound Application")
    is_cold_start = mapped_column(Boolean, default=False)
    pipeline_stage = mapped_column(String, default="Application Received")
    stage_started_at = mapped_column(String, nullable=False)
    next_action = mapped_column(Text, default="Review application.")
    verifications = mapped_column(Integer, default=0)
    alerts = mapped_column(Integer, default=0)
    links = mapped_column(JSON, default=list)  # [{label, href|null}]
    ask_usd = mapped_column(Integer, default=100000)
    created_at = mapped_column(String, nullable=False)
    decision_deadline = mapped_column(String, nullable=False)
    starred = mapped_column(Boolean, default=False)
    viable = mapped_column(Boolean, default=True)  # spam/joke filter verdict; non-viable stay out of dealflow
    filter_reason = mapped_column(Text, nullable=True)
    errors = mapped_column(JSON, default=list)  # degraded-pipeline notes, additive field


class DealFounderRow(Base):
    __tablename__ = "deal_founders"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id = mapped_column(String, index=True, nullable=False)
    founder_id = mapped_column(String, index=True, nullable=False)
    lead = mapped_column(Boolean, default=False)
    role = mapped_column(String, default="Other")


class SignalRow(Base):
    __tablename__ = "signals"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    founder_id = mapped_column(String, index=True, nullable=True)
    deal_id = mapped_column(String, index=True, nullable=True)
    source = mapped_column(String, nullable=False)
    signal_type = mapped_column(String, nullable=False)
    raw_json = mapped_column(JSON, default=dict)
    fetched_at = mapped_column(String, nullable=False)


class ClaimRow(Base):
    __tablename__ = "claims"
    id = mapped_column(String, primary_key=True)
    deal_id = mapped_column(String, index=True, nullable=False)
    claim = mapped_column(Text, nullable=False)
    status = mapped_column(String, default="unverified")
    trust_score = mapped_column(Integer, default=50)
    detail = mapped_column(Text, default="")
    source = mapped_column(String, nullable=True)
    source_url = mapped_column(String, nullable=True)
    collected_at = mapped_column(String, nullable=False)
    verified_at = mapped_column(String, nullable=True)
    conflicting_evidence = mapped_column(Text, nullable=True)
    ai_explanation = mapped_column(Text, default="")
    review_notes = mapped_column(JSON, default=list)


class AxisAssessmentRow(Base):
    __tablename__ = "axis_assessments"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id = mapped_column(String, index=True, nullable=False)
    founder_axis = mapped_column(JSON, nullable=False)     # {score, trend, summary, note}
    market = mapped_column(JSON, nullable=False)           # {rating, trend, tam, summary, competitors} — NO numeric score
    idea_vs_market = mapped_column(JSON, nullable=False)   # {score, trend, verdict, flexibility}
    team_coverage = mapped_column(JSON, default=list)      # [{area, rating, note?}]
    version = mapped_column(Integer, default=1)
    created_at = mapped_column(String, nullable=False)


class ThesisRow(Base):
    __tablename__ = "theses"
    id = mapped_column(String, primary_key=True)
    name = mapped_column(String, nullable=False)
    sectors = mapped_column(JSON, default=list)
    stage = mapped_column(String, default="Seed")
    geography = mapped_column(JSON, default=list)
    risk = mapped_column(String, default="Moderate")
    check_size_usd = mapped_column(Integer, default=100000)
    excluded_sectors = mapped_column(JSON, default=list)
    active = mapped_column(Boolean, default=False)


class MemoRow(Base):
    __tablename__ = "memos"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id = mapped_column(String, index=True, nullable=False)
    memo_json = mapped_column(JSON, nullable=False)
    version = mapped_column(Integer, default=1)
    created_at = mapped_column(String, nullable=False)


class AuditTrailRow(Base):
    __tablename__ = "audit_trail"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id = mapped_column(String, index=True, nullable=False)
    decision = mapped_column(String, nullable=False)
    note = mapped_column(Text, nullable=False)
    conditions = mapped_column(Text, nullable=True)
    timestamp = mapped_column(String, nullable=False)


class OutreachDraftRow(Base):
    __tablename__ = "outreach_drafts"
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    founder_id = mapped_column(String, index=True, nullable=False)
    deal_id = mapped_column(String, index=True, nullable=True)
    draft_text = mapped_column(Text, nullable=False)
    created_at = mapped_column(String, nullable=False)
