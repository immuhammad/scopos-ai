"""Trust pipeline — per CLAIM, numeric 0-100 + status. Internal cross-artifact
contradiction check first, then Tavily external verification. 'Unverified' is
normal for early-stage startups, not damning; contradictions are flagged before
reaching the investor."""
import asyncio
import json
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import MODEL_MINI, TAVILY_API_KEY
from app.llm import ContradictionCheckLLM, TrustClassificationLLM, safe_parse
from app.models import ClaimRow, DealFounderRow, DealRow, FounderRow


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def trust_score_for(status: str, confidence: float) -> int:
    c = min(1.0, max(0.0, confidence))
    if status == "verified":
        return int(round(80 + 18 * c))       # 80-98
    if status == "contradicted":
        return int(round(30 - 25 * c))       # 5-30 (higher confidence → lower score)
    return int(round(35 + 30 * c))           # unverified 35-65


def _tavily_search(query: str) -> Optional[List[dict]]:
    if not TAVILY_API_KEY:
        return None
    try:
        from tavily import TavilyClient
        resp = TavilyClient(api_key=TAVILY_API_KEY).search(query, max_results=5)
        return resp.get("results", [])
    except Exception:  # noqa: BLE001 — external verification is best-effort
        return None


async def verify_claim(claim: ClaimRow, company: str, other_evidence: str,
                       errors: List[str]) -> None:
    """Mutates the claim row in place; appends degradation notes to errors."""
    # 1) internal cross-artifact contradiction check
    check, err = await safe_parse(
        "trust-internal:{}".format(claim.id), MODEL_MINI,
        "You are a VC diligence analyst. Decide whether the claim is contradicted "
        "by the founder's/deal's OTHER submitted artifacts and signals. Only flag "
        "a contradiction when evidence genuinely conflicts (e.g. deck says revenue, "
        "artifact says waitlist-only). Absence of evidence is NOT a contradiction.",
        "CLAIM: {}\n\nOTHER ARTIFACTS AND SIGNALS:\n{}".format(claim.claim, other_evidence[:6000]),
        ContradictionCheckLLM,
    )
    if err:
        errors.append(err)
        claim.detail = "Verification degraded: internal check unavailable."
        claim.ai_explanation = "Left unverified because the verification pipeline was unavailable."
        return
    if check.contradicted:
        claim.status = "contradicted"
        claim.trust_score = trust_score_for("contradicted", 0.8)
        claim.conflicting_evidence = check.conflicting_evidence or check.explanation
        claim.detail = check.explanation
        claim.source = claim.source or "Cross-artifact scan"
        claim.verified_at = _now_iso()
        claim.ai_explanation = "Internal cross-artifact check: {}".format(check.explanation)
        return

    # 2) external verification via Tavily
    query = "{} {}".format(company, claim.claim)[:380]
    results = await asyncio.to_thread(_tavily_search, query)
    if results is None:
        claim.status = "unverified"
        claim.trust_score = trust_score_for("unverified", 0.5)
        claim.detail = "External verification unavailable; treated as unverified (normal at early stage)."
        claim.ai_explanation = "No external check performed — search unavailable."
        return
    evidence = json.dumps([
        {"title": r.get("title"), "url": r.get("url"), "content": (r.get("content") or "")[:500]}
        for r in results
    ])
    cls, err = await safe_parse(
        "trust-external:{}".format(claim.id), MODEL_MINI,
        "Classify whether external web evidence verifies, contradicts, or leaves "
        "unverified the startup claim. 'Unverified' is normal for early startups — "
        "absence of coverage is NOT a contradiction. Only 'contradicted' when "
        "evidence actively conflicts. confidence is 0-1.",
        "COMPANY: {}\nCLAIM: {}\n\nSEARCH RESULTS:\n{}".format(company, claim.claim, evidence),
        TrustClassificationLLM,
    )
    if err:
        errors.append(err)
        claim.status = "unverified"
        claim.trust_score = trust_score_for("unverified", 0.5)
        claim.detail = "External classification degraded; left unverified."
        claim.ai_explanation = "Search ran but classification was unavailable."
        return
    claim.status = cls.status
    claim.trust_score = trust_score_for(cls.status, cls.confidence)
    claim.detail = cls.detail
    claim.ai_explanation = cls.explanation
    if cls.source_url:
        claim.source_url = cls.source_url
        claim.source = claim.source or "Tavily web search"
    if cls.status in ("verified", "contradicted"):
        claim.verified_at = _now_iso()
    if cls.status == "contradicted" and not claim.conflicting_evidence:
        claim.conflicting_evidence = cls.detail


def refresh_deal_trust_counters(db: Session, deal: DealRow) -> None:
    claims = db.execute(select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all()
    deal.verifications = sum(1 for c in claims if c.status == "verified")
    deal.alerts = sum(1 for c in claims if c.status == "contradicted")
    contradicted = deal.alerts
    links = db.execute(select(DealFounderRow).where(DealFounderRow.deal_id == deal.id)).scalars().all()
    for link in links:
        founder = db.get(FounderRow, link.founder_id)
        if founder is None:
            continue
        # per-founder count = contradicted claims across all their deals
        their_deals = db.execute(
            select(DealFounderRow.deal_id).where(DealFounderRow.founder_id == founder.id)
        ).scalars().all()
        founder.contradiction_count = len(db.execute(
            select(ClaimRow).where(ClaimRow.deal_id.in_(their_deals),
                                   ClaimRow.status == "contradicted")
        ).scalars().all())
        db.add(founder)
    db.add(deal)
