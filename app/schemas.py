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
    source_quote: Optional[str] = None  # quote-anchored: the exact sentence the claim came from
    artifact: Optional[str] = None      # which artifact the conflicting quote came from


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


DecisionKind = Literal["approve", "approve_conditions", "continue_diligence", "decline"]
ThesisRisk = Literal["Conservative", "Balanced", "Aggressive"]


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
    first_signal_at: Optional[str] = None           # additive: speed instrumentation
    decided_at: Optional[str] = None
    signal_to_decision_hours: Optional[float] = None


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
    has_cv: Optional[bool] = None
    cv_text: Optional[str] = None
    deck_text: Optional[str] = None
    deck_file: Optional[str] = None  # base64 PDF — text extracted server-side
    cv_file: Optional[str] = None    # base64 PDF
    ask_usd: Optional[int] = None    # funding sought; "Not disclosed" when absent
    video_pitch: Optional[str] = None
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
    new_founder_ids: List[str] = Field(default_factory=list)
    deal: Optional[Deal] = None  # None when filtered as non-viable
    viable: bool = True
    filter_reason: Optional[str] = None  # set when viable=False (additive field)
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


# ---- v2 surfaces conforming to the evolved frontend api.ts ----

class DecisionRecord(CamelModel):
    id: str
    deal_id: str
    kind: DecisionKind
    note: str
    conditions: Optional[str] = None
    timestamp: str
    analysis_label: str
    actor: str


class DecideV2Payload(CamelModel):
    decision: DecisionKind
    note: str = Field(min_length=1)
    conditions: Optional[str] = None
    actor: Optional[str] = None


class StagePayload(CamelModel):
    stage: PipelineStage
    next_action: Optional[str] = None


class MemoEnvelope(CamelModel):
    memo: Memo
    generated_at: str
    version: int


class BriefingV2(CamelModel):
    url: Optional[str] = None          # absolute URL so the mp3 plays cross-origin
    duration_sec: float = 0
    generated_at: str
    audio_url: Optional[str] = None    # additive back-compat
    transcript: str = ""
    chapters: List[Chapter] = Field(default_factory=list)


class ThesisV2(CamelModel):
    id: str
    name: str
    sector: str
    stage: str
    geography: str
    risk: ThesisRisk
    check_size: int
    excluded_sectors: List[str]
    created_at: str
    ownership_target_pct: float
    active: bool = False  # additive


class ThesisV2Payload(CamelModel):
    id: Optional[str] = None
    name: str
    sector: str = "All Sectors"
    stage: str = "All Stages"
    geography: str = "Global"
    risk: ThesisRisk = "Balanced"
    check_size: int = 100000
    excluded_sectors: List[str] = Field(default_factory=list)
    ownership_target_pct: float = 10.0
    active: Optional[bool] = None


class OutreachSignal(CamelModel):
    label: str
    detail: str
    points: Optional[int] = None  # additive: transparent breakdown


class OutreachState(CamelModel):
    status: Literal["not_sent", "sent"]  # frontend enum; sends are ALWAYS simulated
    sent_at: Optional[str] = None
    channel: Optional[str] = None
    draft_ready: bool = False   # additive
    simulated: bool = True      # additive: no real message ever leaves the system


class OutreachDraft(CamelModel):
    subject: str
    body: str
    signals: List[OutreachSignal]
    signal_strength: int


class SendOutreachPayload(CamelModel):
    channel: Optional[Literal["Email", "LinkedIn", "Twitter"]] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class Artifact(CamelModel):
    id: str
    label: str
    kind: Literal["deck", "cv", "video"]
    note: str


class IngestEntities(CamelModel):
    signals: List[SourcingItem]
    founders: List[Founder]
    deals: List[Deal]           # additive vs frontend type
    skipped: int = 0
    errors: List[str] = Field(default_factory=list)


class NLCriteria(CamelModel):
    sector: Optional[str] = None
    stage: Optional[str] = None
    geography: Optional[str] = None
    min_founder_score: Optional[int] = None
    cold_start: Optional[bool] = None
    verified_only: Optional[bool] = None
    has_contradictions: Optional[bool] = None
    keyword: Optional[str] = None
    raw: str


class SearchDealHitV2(CamelModel):
    deal: Deal
    match: int
    why: List[str]
    missing: List[str] = Field(default_factory=list)  # additive


class SearchFounderHitV2(CamelModel):
    founder: Founder
    match: int
    why: List[str]


class SearchResponseV2(CamelModel):
    criteria: NLCriteria
    deals: List[SearchDealHitV2]
    founders: List[SearchFounderHitV2]


class TraceItem(CamelModel):
    step: str
    model: str
    summary: str
    duration_ms: int
    created_at: str


class MetricsSummary(CamelModel):
    pending_count: int
    decided_count: int
    median_signal_to_decision_hours: Optional[float] = None
    contradictions_caught: int
    cold_start_count: int
    real_sourced_count: int


class FeedbackNote(CamelModel):
    deal_id: Optional[str] = None
    decision: Optional[str] = None
    note: Optional[str] = None
    at: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
