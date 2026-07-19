"""Outbound sourcing via GitHub repo search (created <30d, >50 stars).

Scans create LEADS: real owner record + real repo signals + a Sourced-stage
deal with no claims/axes/memo. Same funnel, activated only on application."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import GITHUB_TOKEN
from app.models import DealFounderRow, DealRow, FounderRow, SignalRow
from app.services.founder_score import recompute_founder_score
from app.services.github_enrich import enrich_github
from app.services.outreach import draft_outreach
from app.services.pipeline import active_thesis, find_founder
from app.services.slugs import unique_slug
from app.services.trace import record_trace


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _already_ingested(db: Session, repo_id: int) -> bool:
    for s in db.execute(select(SignalRow).where(
            SignalRow.signal_type == "github_repo_trending")).scalars().all():
        if (s.raw_json or {}).get("repo_id") == repo_id:
            return True
    return False


async def ingest_github(db: Session, process_limit: int = 5) -> Dict:
    errors: List[str] = []
    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = "Bearer {}".format(GITHUB_TOKEN)
    try:
        async with httpx.AsyncClient(timeout=20, headers=headers) as http:
            resp = await http.get("https://api.github.com/search/repositories", params={
                "q": "created:>{} stars:>50".format(since),
                "sort": "stars", "order": "desc", "per_page": 15})
            resp.raise_for_status()
            repos = resp.json().get("items", [])
    except Exception as exc:  # noqa: BLE001 — network failure must not 500
        return {"newSignals": 0, "newFounders": 0, "newDeals": 0, "skipped": 0,
                "errors": ["GitHub search unreachable: {}".format(exc)],
                "dealIds": [], "founderIds": [], "signalIds": []}

    new_signals = new_founders = new_deals = skipped = 0
    leads_created = 0
    created_deal_ids: List[str] = []
    created_founder_ids: List[str] = []
    created_signal_ids: List[int] = []
    now = _now_iso()

    for repo in repos:
        repo_id = repo.get("id")
        if _already_ingested(db, repo_id):
            skipped += 1
            continue
        owner = (repo.get("owner") or {}).get("login") or "unknown"
        if (repo.get("owner") or {}).get("type") == "Organization":
            skipped += 1  # orgs aren't founder leads
            continue
        name = repo.get("name") or "untitled"
        desc = repo.get("description") or ""
        stars = repo.get("stargazers_count", 0)
        html_url = repo.get("html_url")
        email = "{}@github.invalid".format(owner.lower())  # synthetic dedup key

        founder = find_founder(db, email, github="https://github.com/{}".format(owner))
        if founder is None:
            founder = FounderRow(
                id=unique_slug(db, FounderRow, owner), name=owner, role="Other",
                email=email, github="https://github.com/{}".format(owner),
                location="Not disclosed", expertise=[], founder_score=0,
                score_trend="flat", components=[], history=[],
                contact_status="Discovered", contradiction_count=0,
                bio="Discovered via trending GitHub repo. Email not disclosed.",
                created_at=now)
            db.add(founder)
            db.flush()
            created_founder_ids.append(founder.id)
            new_founders += 1

        sig = SignalRow(founder_id=founder.id, source="GitHub",
                        signal_type="github_repo_trending",
                        raw_json={"repo_id": repo_id, "title": name, "stars": stars,
                                  "url": html_url,
                                  "description": desc[:400],
                                  "text": "Repo '{}' trending — {} stars in <30d".format(name, stars)},
                        fetched_at=now)
        db.add(sig)
        db.flush()
        created_signal_ids.append(sig.id)
        new_signals += 1

        if leads_created >= process_limit:
            skipped += 1
            continue
        leads_created += 1

        deal_id = unique_slug(db, DealRow, name)
        deal = DealRow(
            id=deal_id, company=name[:60],
            tagline=desc[:200] or "Open-source project '{}'".format(name),
            sector="Not disclosed", stage="Pre-Seed", geography="Not disclosed",
            source="Outbound Discovery via GitHub", pipeline_stage="Sourced",
            stage_started_at=now, first_signal_at=now,
            next_action="Review lead footprint and send outreach.",
            links=[{"label": "GitHub", "href": html_url}], created_at=now,
            decision_deadline=(datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
            errors=[])
        db.add(deal)
        db.add(DealFounderRow(deal_id=deal_id, founder_id=founder.id, lead=True,
                              role=founder.role))
        sig.deal_id = deal_id
        db.flush()
        created_deal_ids.append(deal_id)
        new_deals += 1

        data = await enrich_github(owner)
        if data is not None:
            db.add(SignalRow(founder_id=founder.id, deal_id=deal_id, source="GitHub API",
                             signal_type="github_profile", raw_json=data, fetched_at=now))
            db.flush()
        recompute_founder_score(db, founder, "Discovered via trending repo: {}".format(name))
        record_trace(db, deal_id, "lead-created", "",
                     "Outbound lead from real trending repo ({} stars) — no claims/axes until an application arrives".format(stars))
        await draft_outreach(
            db, founder.id, deal_id,
            "GitHub repo '{}' ({} stars in under 30 days): {}".format(name, stars, desc),
            active_thesis(db), errors)
        db.commit()

    db.commit()
    return {"newSignals": new_signals, "newFounders": new_founders,
            "newDeals": new_deals, "skipped": skipped, "errors": errors,
            "dealIds": created_deal_ids, "founderIds": created_founder_ids,
            "signalIds": created_signal_ids}
