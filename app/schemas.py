"""Pydantic models mirroring contract/mocks.ts + contract/api.ts exactly.

All response JSON is camelCase (alias_generator=to_camel). Field names here are
snake_case; FastAPI serializes by alias. Additive fields (auditTrail, errors)
are allowed by the contract; renames are not.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Trend = Literal["up", "flat", "down"]
MarketRating = Literal["Bullish", "Neutral", "Bear"]
ClaimStatus = Literal["verified", "unverified", "contradicted"]
ContactStatus = Literal[
    "Discovered", "Reviewing", "Contacted", "Invited to Apply",
    "Applied", "In Diligence", "Funded", "Passed",
]
PipelineStage = Literal[
    "Sourced", "Invited", "Application Received",
    "Screening", "Diligence", "Decision Ready", "Approved", "Declined",
]
CoverageRating = Literal["Strong", "Moderate", "Weak", "Missing", "Unknown"]
SourceType = Literal[
    "Inbound Application", "Outbound Discovery via GitHub",
    "Outbound — Show HN", "Cold-Start Founder", "Inbound — Referral",
]
FounderRole = Literal["CEO", "CTO", "COO", "CPO", "Other"]
Decision = Literal["approve", "approve_with_conditions", "continue_diligence", "decline"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Claim(CamelModel):
    id: str
    claim: str
    status: ClaimStatus
    trust_score: int
    detail: str
    source: Optional[str] = None
    source_url: Optional[str] = None
    collected_at: str
    verified_at: Optional[str] = None
    conflicting_evidence: Optional[str] = None
    ai_explanation: str
    review_notes: Optional[List[str]] = None


class FounderComponent(CamelModel):
    label: str
    points: int


class FounderEvent(CamelModel):
    date: str
    event: str
    source: str
    delta: int


class Founder(CamelModel):
    id: str
    name: str
    role: FounderRole
    email: str
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    location: str
    expertise: List[str]
    founder_score: int
    score_trend: Trend
    components: List[FounderComponent]
    history: List[FounderEvent]
    projects: List[str]
    contact_status: ContactStatus
    contradiction_count: int
    bio: str


class FounderAxis(CamelModel):
    score: int
    trend: Trend
    summary: str
    note: str


class MarketAxis(CamelModel):
    # Market axis has NO numeric score in the contract — rating/trend/tam/summary/competitors only.
    rating: MarketRating
    trend: Trend
    tam: str
    summary: str
    competitors: List[str]


class IdeaVsMarketAxis(CamelModel):
    score: int
    trend: Trend
    verdict: str
    flexibility: str


class TeamCoverageItem(CamelModel):
    area: str
    rating: CoverageRating
    note: Optional[str] = None


class DealLink(CamelModel):
    label: str
    href: Optional[str] = None  # string | null — null when missing, never "#"


class MemoSwot(CamelModel):
    strengths: List[str]
    weaknesses: List[str]
    opportunities: List[str]
    risks: List[str]


class MemoTraction(CamelModel):
    label: str
    value: str


class Memo(CamelModel):
    snapshot: str
    hypotheses: List[str]
    swot: MemoSwot
    problem_product: str
    traction: List[MemoTraction]


class AuditEntry(CamelModel):
    decision: str
    note: str
    conditions: Optional[str] = None
    timestamp: str


class Deal(CamelModel):
    id: str
    company: str
    tagline: str
    sector: str
    stage: str
    geography: str
    source: SourceType
    is_cold_start: Optional[bool] = None
    pipeline_stage: PipelineStage
    time_in_stage_hours: float
    next_action: str
    founder_ids: List[str]
    founder_axis: FounderAxis
    market: MarketAxis
    idea_vs_market: IdeaVsMarketAxis
    team_coverage: List[TeamCoverageItem]
    verifications: int
    alerts: int
    links: List[DealLink]
    claims: List[Claim]
    memo: Memo
    ask_usd: int
    created_at: str
    decision_deadline: str
    starred: Optional[bool] = None
    audit_trail: Optional[List[AuditEntry]] = None  # additive
    errors: Optional[List[str]] = None              # additive: degraded-pipeline notes


class SourcingItem(CamelModel):
    id: str
    time: str
    source: str
    text: str


class Thesis(CamelModel):
    id: str
    name: str
    sectors: List[str]
    stage: str
    geography: List[str]
    risk: str
    check_size_usd: int
    excluded_sectors: List[str]
    active: bool


# ---- request payloads ----

class ApplicationFounder(CamelModel):
    name: str
    role: str
    email: str
    linkedin: Optional[str] = None
    github: Optional[str] = None


class ApplicationPayload(CamelModel):
    company: str
    tagline: Optional[str] = None
    sector: Optional[str] = None
    stage: Optional[str] = None
    geography: Optional[str] = None
    founders: List[ApplicationFounder]
    links: List[str] = Field(default_factory=list)
    has_deck: bool = False
    cv_text: Optional[str] = None
    video_pitch_url: Optional[str] = None


class StarPayload(CamelModel):
    starred: bool


class DecidePayload(CamelModel):
    decision: Decision
    note: str = Field(min_length=1)
    conditions: Optional[str] = None


class ContactStatusPayload(CamelModel):
    status: ContactStatus


class ClaimNotePayload(CamelModel):
    note: str = Field(min_length=1)


class ThesisPayload(CamelModel):
    id: Optional[str] = None
    name: str
    sectors: List[str] = Field(default_factory=list)
    stage: str = "Seed"
    geography: List[str] = Field(default_factory=list)
    risk: str = "Moderate"
    check_size_usd: int = 100000
    excluded_sectors: List[str] = Field(default_factory=list)
    active: bool = False


class SearchPayload(CamelModel):
    query: str = Field(min_length=1)


# ---- response payloads ----

class ApplicationResponse(CamelModel):
    deal_id: str
    matched_founder_ids: List[str]
    deal: Optional[Deal] = None  # None when filtered as non-viable
    viable: bool = True
    errors: List[str] = Field(default_factory=list)


class Chapter(CamelModel):
    title: str
    start_sec: float


class BriefingResponse(CamelModel):
    audio_url: Optional[str] = None
    transcript: str
    chapters: List[Chapter]


class SearchDealHit(CamelModel):
    id: str
    match_pct: int
    why: str
    missing: List[str]


class SearchFounderHit(CamelModel):
    id: str
    match_pct: int
    why: str


class SearchResponse(CamelModel):
    criteria: List[str]
    deals: List[SearchDealHit]
    founders: List[SearchFounderHit]


class IngestResponse(CamelModel):
    new_signals: int
    new_founders: int
    new_deals: int
    skipped: int = 0
    errors: List[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str = "ok"
