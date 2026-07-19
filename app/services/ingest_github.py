"""Outbound sourcing via GitHub repo search (created <30d, >50 stars). Repo
owners run through the SAME intake pipeline — one funnel, drafts only."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import GITHUB_TOKEN
from app.models import FounderRow, SignalRow
from app.schemas import ApplicationFounder, ApplicationPayload
from app.services.outreach import draft_outreach
from app.services.pipeline import active_thesis, find_founder, process_application
from app.services.slugs import unique_slug


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
                "errors": ["GitHub search unreachable: {}".format(exc)]}

    new_signals = new_founders = new_deals = skipped = 0
    processed = 0
    for repo in repos:
        repo_id = repo.get("id")
        if _already_ingested(db, repo_id):
            skipped += 1
            continue
        owner = (repo.get("owner") or {}).get("login") or "unknown"
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
                created_at=_now_iso())
            db.add(founder)
            db.flush()
            new_founders += 1
        db.add(SignalRow(founder_id=founder.id, source="GitHub",
                         signal_type="github_repo_trending",
                         raw_json={"repo_id": repo_id, "title": name, "stars": stars,
                                   "url": html_url,
                                   "text": "Repo '{}' trending — {} stars in <30d".format(name, stars)},
                         fetched_at=_now_iso()))
        db.flush()
        new_signals += 1

        if processed >= process_limit:
            skipped += 1
            continue
        processed += 1

        payload = ApplicationPayload(
            company=name[:60], tagline=desc[:200] or "Open-source project '{}'".format(name),
            sector="Not disclosed", stage="Pre-Seed", geography="Not disclosed",
            founders=[ApplicationFounder(name=owner, role="Other", email=email,
                                         github="https://github.com/{}".format(owner))],
            links=[html_url] if html_url else [], has_deck=False)
        deal, _, errs = await process_application(
            db, payload, source="Outbound Discovery via GitHub",
            new_contact_status="Reviewing")
        errors.extend(errs)
        new_deals += 1
        draft = await draft_outreach(
            db, founder.id, deal.id,
            "GitHub repo '{}' ({} stars in under 30 days): {}".format(name, stars, desc),
            active_thesis(db), errors)
        founder.contact_status = "Reviewing" if draft else founder.contact_status
        db.commit()

    db.commit()
    return {"newSignals": new_signals, "newFounders": new_founders,
            "newDeals": new_deals, "skipped": skipped, "errors": errors}
