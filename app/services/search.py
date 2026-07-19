"""Natural-language search: gpt-4o-mini parses the query into structured
criteria once, then a deterministic scorer matches deals + founders. Each hit
explains WHY (criteria that matched, citing fields) and what's MISSING."""
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import MODEL_MINI
from app.llm import SearchCriteriaLLM, safe_parse
from app.models import ClaimRow, DealFounderRow, DealRow, FounderRow


def _contains(haystack: str, needle: str) -> bool:
    return needle.lower() in (haystack or "").lower()


async def run_search(db: Session, query: str) -> Dict:
    parsed, err = await safe_parse(
        "search-parse", MODEL_MINI,
        "Parse this natural-language dealflow search into structured criteria: "
        "sectors, geographies, stages, and free keywords (technical profile, "
        "traction, open-source experience, funding history...). Set "
        "cold_start_only true only if the query asks for founders without track "
        "records; min_founder_score only if the query implies a quality bar. "
        "criteria is the human-readable chip list, one chip per constraint.",
        query, SearchCriteriaLLM)
    if parsed is None:
        # degrade to a keyword-only search, never 500
        parsed = SearchCriteriaLLM(criteria=[query], sectors=[], geographies=[],
                                   stages=[], keywords=[query.split()[0]] if query.split() else [],
                                   cold_start_only=None, min_founder_score=None)

    # (chip label, kind, value) triples keep chips and scoring aligned
    checks: List[Tuple[str, str, str]] = []
    for s in parsed.sectors:
        checks.append(("Sector: {}".format(s), "sector", s))
    for g in parsed.geographies:
        checks.append(("Geography: {}".format(g), "geography", g))
    for st in parsed.stages:
        checks.append(("Stage: {}".format(st), "stage", st))
    for k in parsed.keywords:
        checks.append(("Keyword: {}".format(k), "keyword", k))
    if parsed.cold_start_only:
        checks.append(("Cold-start founder", "cold_start", ""))
    if parsed.min_founder_score is not None:
        checks.append(("Founder Score ≥ {}".format(parsed.min_founder_score),
                       "min_score", str(parsed.min_founder_score)))
    if not checks:
        checks = [("Keyword: {}".format(w), "keyword", w) for w in query.split()[:5]]

    deal_hits = []
    for deal in db.execute(select(DealRow).where(DealRow.viable.is_(True))).scalars().all():
        claims_text = " ".join(c.claim for c in db.execute(
            select(ClaimRow).where(ClaimRow.deal_id == deal.id)).scalars().all())
        founder_ids = [l.founder_id for l in db.execute(
            select(DealFounderRow).where(DealFounderRow.deal_id == deal.id)).scalars().all()]
        founder_rows = [db.get(FounderRow, fid) for fid in founder_ids]
        founder_rows = [f for f in founder_rows if f is not None]
        max_score = max([f.founder_score or 0 for f in founder_rows], default=0)
        blob = " ".join([deal.company, deal.tagline or "", deal.sector or "",
                         claims_text] + [f.name for f in founder_rows]
                        + [" ".join(f.expertise or []) for f in founder_rows])
        why, missing = [], []
        for label, kind, value in checks:
            hit = False
            if kind == "sector":
                hit = _contains(deal.sector, value) or _contains(deal.tagline, value)
                hit and why.append("{} (sector: {})".format(label, deal.sector))
            elif kind == "geography":
                hit = _contains(deal.geography, value)
                hit and why.append("{} (geography: {})".format(label, deal.geography))
            elif kind == "stage":
                hit = _contains(deal.stage, value)
                hit and why.append("{} (stage: {})".format(label, deal.stage))
            elif kind == "keyword":
                hit = _contains(blob, value)
                hit and why.append("{} (company/claims text)".format(label))
            elif kind == "cold_start":
                hit = bool(deal.is_cold_start)
                hit and why.append("Cold-start deal (isColdStart)")
            elif kind == "min_score":
                hit = max_score >= int(value)
                hit and why.append("{} (best Founder Score: {})".format(label, max_score))
            if not hit:
                missing.append(label)
        if why:
            deal_hits.append({"id": deal.id,
                              "matchPct": int(round(100 * len(why) / len(checks))),
                              "why": "; ".join(why), "missing": missing})

    founder_hits = []
    for f in db.execute(select(FounderRow)).scalars().all():
        blob = " ".join([f.name, f.bio or "", f.location or "",
                         " ".join(f.expertise or [])])
        why = []
        applicable = 0
        for label, kind, value in checks:
            if kind in ("sector", "keyword"):
                applicable += 1
                if _contains(blob, value):
                    why.append("{} (expertise/bio)".format(label))
            elif kind == "geography":
                applicable += 1
                if _contains(f.location, value):
                    why.append("{} (location: {})".format(label, f.location))
            elif kind == "min_score":
                applicable += 1
                if (f.founder_score or 0) >= int(value):
                    why.append("{} (Founder Score: {})".format(label, f.founder_score))
        if why and applicable:
            founder_hits.append({"id": f.id,
                                 "matchPct": int(round(100 * len(why) / applicable)),
                                 "why": "; ".join(why)})

    deal_hits.sort(key=lambda h: -h["matchPct"])
    founder_hits.sort(key=lambda h: -h["matchPct"])
    return {"criteria": [c[0] for c in checks], "deals": deal_hits[:20],
            "founders": founder_hits[:20]}
