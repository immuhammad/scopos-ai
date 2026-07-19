"""Three INDEPENDENT axes — Founder / Market / Idea-vs-Market — assessed by
three separate gpt-4o calls run concurrently, stored versioned, NEVER averaged
into one number anywhere. Founder Score is one INPUT to the founder axis (which
evaluates the whole TEAM for THIS opportunity), never a substitute."""
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import MODEL_MAIN
from app.llm import FounderAxisLLM, IdeaVsMarketLLM, MarketAxisLLM, safe_parse
from app.models import AxisAssessmentRow, DealRow, FounderRow, ThesisRow

COVERAGE_AREAS = ["Product", "Engineering", "AI / domain", "Enterprise sales",
                  "Marketing", "Finance", "Operations"]

_RATING_ORD = {"Bear": 0, "Neutral": 1, "Bullish": 2}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trend(new: int, old: Optional[int]) -> str:
    if old is None or new == old:
        return "flat"
    return "up" if new > old else "down"


def _thesis_text(thesis: Optional[ThesisRow]) -> str:
    if thesis is None:
        return "No active investment thesis."
    return ("Active thesis '{}': sectors {}, stage {}, geography {}, risk {}, "
            "check size ${}, excluded sectors {}.").format(
        thesis.name, thesis.sectors, thesis.stage, thesis.geography,
        thesis.risk, thesis.check_size_usd, thesis.excluded_sectors)


def _founder_profiles(founders: List[FounderRow]) -> str:
    lines = []
    for f in founders:
        lines.append(
            "- {} ({}), Founder Score {} (persistent per-person input, NOT the axis), "
            "expertise: {}, contradictions on record: {}, bio: {}".format(
                f.name, f.role, f.founder_score, ", ".join(f.expertise or []) or "unknown",
                f.contradiction_count, (f.bio or "")[:300]))
    return "\n".join(lines) or "No founder profiles available."


async def assess_axes(db: Session, deal: DealRow, founders: List[FounderRow],
                      claims_text: str, evidence_text: str,
                      thesis: Optional[ThesisRow], errors: List[str],
                      cold_start_note: Optional[str] = None
                      ) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], List[Dict[str, Any]]]:
    prev = db.execute(
        select(AxisAssessmentRow).where(AxisAssessmentRow.deal_id == deal.id)
        .order_by(AxisAssessmentRow.version.desc())
    ).scalars().first()

    common = (
        "DEAL: {} — {} | sector {} | stage {} | geography {}\n"
        "{}\n\nFOUNDER TEAM:\n{}\n\nCLAIMS (with trust status):\n{}\n\nEVIDENCE / SIGNALS:\n{}"
    ).format(deal.company, deal.tagline, deal.sector, deal.stage, deal.geography,
             _thesis_text(thesis), _founder_profiles(founders),
             claims_text[:4000], evidence_text[:4000])

    guard = ("Ground every judgment in the evidence quoted above. If evidence is thin, "
             "say so explicitly in the summary — never invent facts. ")

    founder_task = safe_parse(
        "axis-founder", MODEL_MAIN,
        "You are a VC assessing the FOUNDER AXIS: the WHOLE TEAM in context of THIS "
        "specific opportunity (1-100; calibrate ~90 = exceptional repeat-founder team). "
        "Each founder's persistent Founder Score is ONE input among many — never a "
        "substitute; also weigh composition, coverage gaps, and evidence. "
        "For team_coverage rate each of exactly these areas once: {}. "
        "Use 'Unknown' when there is no evidence — never invent coverage. "
        "{}{}".format(", ".join(COVERAGE_AREAS), guard,
                      "This is a COLD-START founder: include this uncertainty note in your note field: '{}'. "
                      "Assess footprint (writing specificity, domain insight, shipped artifacts) rather than "
                      "penalizing missing track record.".format(cold_start_note) if cold_start_note else ""),
        common, FounderAxisLLM)
    market_task = safe_parse(
        "axis-market", MODEL_MAIN,
        "You are a VC assessing the MARKET AXIS on its own (no numeric score — a "
        "rating of Bullish/Neutral/Bear). tam must come from the claims/evidence; "
        "if no TAM is evidenced, write exactly 'Not disclosed'. List real named "
        "competitors. " + guard,
        common, MarketAxisLLM)
    idea_task = safe_parse(
        "axis-idea", MODEL_MAIN,
        "You are a VC assessing IDEA-VS-MARKET fit on its own (1-100): does this "
        "specific idea fit the market it targets, and how flexible is the team if "
        "the wedge is wrong? " + guard,
        common, IdeaVsMarketLLM)

    (f_res, f_err), (m_res, m_err), (i_res, i_err) = await asyncio.gather(
        founder_task, market_task, idea_task)
    for e in (f_err, m_err, i_err):
        if e:
            errors.append(e)

    prev_founder = (prev.founder_axis or {}).get("score") if prev else None
    prev_market = _RATING_ORD.get((prev.market or {}).get("rating", "")) if prev else None
    prev_idea = (prev.idea_vs_market or {}).get("score") if prev else None

    if f_res:
        note = f_res.note
        if cold_start_note:
            if cold_start_note not in note:
                note = (note + " " + cold_start_note).strip()
            if "uncertain" not in note.lower():
                note += (" Uncertainty is wider for this cold-start founder than for "
                         "founders with established track records.")
        founder_axis = {"score": max(1, min(100, f_res.score)),
                        "trend": _trend(f_res.score, prev_founder),
                        "summary": f_res.summary, "note": note}
        team_coverage = [{"area": c.area, "rating": c.rating,
                          **({"note": c.note} if c.note else {})}
                         for c in f_res.team_coverage]
        seen = {c["area"] for c in team_coverage}
        for area in COVERAGE_AREAS:
            if area not in seen:
                team_coverage.append({"area": area, "rating": "Unknown"})
    else:
        founder_axis = {"score": 50, "trend": "flat",
                        "summary": "Founder-axis assessment unavailable — LLM degraded; placeholder pending re-run.",
                        "note": (cold_start_note or "Re-run assessment when the model is available.")}
        team_coverage = [{"area": a, "rating": "Unknown"} for a in COVERAGE_AREAS]

    if m_res:
        market = {"rating": m_res.rating,
                  "trend": _trend(_RATING_ORD[m_res.rating], prev_market),
                  "tam": m_res.tam or "Not disclosed", "summary": m_res.summary,
                  "competitors": m_res.competitors}
    else:
        market = {"rating": "Neutral", "trend": "flat", "tam": "Not disclosed",
                  "summary": "Market assessment unavailable — LLM degraded.", "competitors": []}

    if i_res:
        idea = {"score": max(1, min(100, i_res.score)),
                "trend": _trend(i_res.score, prev_idea),
                "verdict": i_res.verdict, "flexibility": i_res.flexibility}
    else:
        idea = {"score": 50, "trend": "flat",
                "verdict": "Assessment unavailable — LLM degraded.",
                "flexibility": "Not assessed."}

    row = AxisAssessmentRow(
        deal_id=deal.id, founder_axis=founder_axis, market=market,
        idea_vs_market=idea, team_coverage=team_coverage,
        version=(prev.version + 1) if prev else 1, created_at=_now_iso())
    db.add(row)
    return founder_axis, market, idea, team_coverage
