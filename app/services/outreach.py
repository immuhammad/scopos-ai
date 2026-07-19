"""Outreach = editable DRAFTS only, sends are SIMULATED. Nothing ever leaves
the system."""
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import MODEL_MINI
from app.llm import OutreachLLM, safe_parse
from app.models import (ClaimRow, DealFounderRow, DealRow, FounderRow,
                        OutreachDraftRow, ThesisRow)


async def draft_outreach(db: Session, founder_id: str, deal_id: str,
                         project_desc: str, thesis: Optional[ThesisRow],
                         errors: List[str]) -> Optional[Dict[str, str]]:
    thesis_line = "our thesis '{}' ({} / {})".format(
        thesis.name, thesis.sector or ", ".join(thesis.sectors or []),
        thesis.stage) if thesis else "our current thesis"
    res, err = await safe_parse(
        "outreach", MODEL_MINI,
        "Draft a personalized VC outreach email (subject + 4-6 sentence body). "
        "Reference the founder's SPECIFIC project concretely, say why it fits the "
        "thesis, and invite them to apply. No generic flattery, no invented facts. "
        "This is a DRAFT a human will edit — do not add signatures.",
        "PROJECT: {}\nTHESIS: {}".format(project_desc[:2000], thesis_line),
        OutreachLLM)
    if res is None:
        errors.append(err)
        return None
    db.add(OutreachDraftRow(founder_id=founder_id, deal_id=deal_id,
                            draft_text=res.body, subject=res.subject,
                            created_at=datetime.now(timezone.utc).isoformat()))
    return {"subject": res.subject, "body": res.body}


_MARKET_SCORE = {"Bullish": 82, "Neutral": 60, "Bear": 40}


def signal_strength(db: Session, deal: DealRow, founder_axis: dict,
                    idea_trend: str, market_rating: str) -> Dict:
    """Server-side mirror of the frontend's transparent breakdown."""
    links = db.execute(select(DealFounderRow).where(DealFounderRow.deal_id == deal.id)).scalars().all()
    founders = [db.get(FounderRow, l.founder_id) for l in links]
    founders = [f for f in founders if f is not None]
    team_max = max([f.founder_score or 0 for f in founders], default=founder_axis.get("score", 50))
    verified = len(db.execute(select(ClaimRow).where(
        ClaimRow.deal_id == deal.id, ClaimRow.status == "verified")).scalars().all())
    market = _MARKET_SCORE.get(market_rating, 60)
    trend = 6 if idea_trend == "up" else (-4 if idea_trend == "down" else 0)
    raw = team_max * 0.45 + market * 0.20 + verified * 6 + trend + 18
    total = max(10, min(100, round(raw)))
    top = sorted(founders, key=lambda f: -(f.founder_score or 0))[0] if founders else None
    breakdown = [
        {"label": "Founder signal (team max)",
         "detail": "{} · Founder score {}".format(top.name, top.founder_score) if top else "No founder linked",
         "points": round(team_max * 0.45)},
        {"label": "Market sentiment", "detail": market_rating, "points": round(market * 0.20)},
        {"label": "Verified public claims", "detail": "{} verified".format(verified), "points": verified * 6},
        {"label": "Momentum (idea-vs-market trend)", "detail": idea_trend, "points": trend},
        {"label": "Baseline outbound interest", "detail": deal.source, "points": 18},
    ]
    return {"strength": total, "breakdown": breakdown}

