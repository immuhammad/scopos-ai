"""Founder Score: per PERSON, persistent, survives across companies, never
resets. Transparent formula — every point lands in a labeled component the
frontend renders. Distinct from the per-deal Founder Axis; the score is one
INPUT to that axis, never a substitute.

Formula: shipped projects 15/ea (cap 3) · launches 10/ea (cap 3) ·
community min(20, 0.1×(stars+HN points)) · consistency 0-10 ·
prior-company bonus 15 · footprint 0-30 (cold-start only).
"""
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DealFounderRow, FounderRow, SignalRow


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def recompute_founder_score(db: Session, founder: FounderRow, event: str,
                            footprint: int = 0,
                            footprint_note: Optional[str] = None) -> Tuple[int, int]:
    """Recompute from signals, append a history event, return (score, delta)."""
    signals = db.execute(
        select(SignalRow).where(SignalRow.founder_id == founder.id)
    ).scalars().all()

    shipped = 0
    launches = 0
    stars = 0
    hn_points = 0
    consistency = 0
    for s in signals:
        raw = s.raw_json or {}
        if s.signal_type == "github_profile":
            repo_signal = raw.get("top_repos") or []
            shipped += len([r for r in repo_signal if r.get("stars", 0) > 0])
            stars += raw.get("total_stars", 0)
            created = raw.get("created_at") or ""
            try:
                years = (datetime.now(timezone.utc)
                         - datetime.strptime(created[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)).days / 365.0
                consistency = max(consistency, min(10, int(years * 2)))
            except ValueError:
                pass
        elif s.signal_type in ("hn_post", "launch"):
            launches += 1
            hn_points += raw.get("points", 0)
        elif s.signal_type == "shipped_artifact":
            shipped += 1

    deal_links = db.execute(
        select(DealFounderRow).where(DealFounderRow.founder_id == founder.id)
    ).scalars().all()
    prior_company = len(deal_links) > 1

    # Components outside the formula (e.g. seeded "Prior Exit") are carried
    # over untouched — the score never resets, it only re-derives its formula part.
    formula_prefixes = ("Shipped Projects", "Launches (", "Community Signal",
                        "Consistency", "Prior Company", "Footprint Assessment")
    components = [c for c in (founder.components or [])
                  if not any(str(c.get("label", "")).startswith(p) for p in formula_prefixes)]
    shipped_capped = min(shipped, 3)
    if shipped_capped:
        components.append({"label": "Shipped Projects ({})".format(shipped), "points": shipped_capped * 15})
    launches_capped = min(launches, 3)
    if launches_capped:
        components.append({"label": "Launches ({})".format(launches), "points": launches_capped * 10})
    community = min(20, int(0.1 * (stars + hn_points)))
    if community:
        components.append({"label": "Community Signal ({} stars / {} HN pts)".format(stars, hn_points),
                           "points": community})
    if consistency:
        components.append({"label": "Consistency (account age / cadence)", "points": consistency})
    if prior_company:
        components.append({"label": "Prior Company (repeat founder)", "points": 15})
    if footprint:
        components.append({"label": "Footprint Assessment (cold-start)", "points": min(30, max(0, footprint))})

    score = min(99, sum(c["points"] for c in components))
    old = founder.founder_score or 0
    delta = score - old

    history = list(founder.history or [])
    history.append({"date": _today(), "event": event,
                    "source": "Scopos pipeline", "delta": delta})
    founder.history = history
    founder.components = components
    founder.founder_score = score
    founder.score_trend = "up" if delta > 0 else ("down" if delta < 0 else "flat")
    db.add(founder)
    return score, delta
