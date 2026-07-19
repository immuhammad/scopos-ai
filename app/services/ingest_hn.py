"""Outbound sourcing via Hacker News Algolia (Show HN + Launch HN, last 30d).
Discovered founders enter the SAME pipeline as inbound applicants — one funnel.
Messages are never sent: outreach lands as editable drafts only."""
import re
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FounderRow, SignalRow
from app.schemas import ApplicationFounder, ApplicationPayload
from app.services.outreach import draft_outreach
from app.services.pipeline import active_thesis, find_founder, process_application
from app.services.slugs import unique_slug

ALGOLIA = "https://hn.algolia.com/api/v1/search_by_date"
GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?")
URL_RE = re.compile(r"https?://[^\s\"'<>]+")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _company_from_title(title: str) -> str:
    t = re.sub(r"^(Show|Launch) HN:?\s*", "", title or "", flags=re.I).strip()
    t = re.split(r"\s+[–—-]\s+|:\s+", t)[0].strip()
    return (t or title or "Untitled HN project")[:60]


async def _fetch_posts(limit: int = 40) -> List[Dict]:
    cutoff = int(time.time()) - 30 * 24 * 3600
    posts: List[Dict] = []
    async with httpx.AsyncClient(timeout=20) as http:
        show = await http.get(ALGOLIA, params={
            "tags": "show_hn", "hitsPerPage": limit,
            "numericFilters": "created_at_i>{}".format(cutoff)})
        show.raise_for_status()
        posts.extend(show.json().get("hits", []))
        launch = await http.get(ALGOLIA, params={
            "query": "Launch HN", "tags": "story", "hitsPerPage": 15,
            "numericFilters": "created_at_i>{}".format(cutoff)})
        if launch.status_code == 200:
            posts.extend(launch.json().get("hits", []))
    seen = set()
    unique = []
    for p in posts:
        oid = p.get("objectID")
        if oid and oid not in seen:
            seen.add(oid)
            unique.append(p)
    return unique[:limit]


def _already_ingested(db: Session, story_id: str) -> bool:
    for s in db.execute(select(SignalRow).where(
            SignalRow.signal_type == "hn_post")).scalars().all():
        if (s.raw_json or {}).get("story_id") == story_id:
            return True
    return False


async def ingest_hn(db: Session, process_limit: int = 5) -> Dict:
    errors: List[str] = []
    try:
        posts = await _fetch_posts()
    except Exception as exc:  # noqa: BLE001 — network failure must not 500
        return {"newSignals": 0, "newFounders": 0, "newDeals": 0, "skipped": 0,
                "errors": ["HN Algolia unreachable: {}".format(exc)]}

    new_signals = new_founders = new_deals = skipped = 0
    processed = 0
    created_deal_ids: List[str] = []
    created_founder_ids: List[str] = []
    created_signal_ids: List[int] = []
    for post in posts:
        story_id = str(post.get("objectID"))
        if _already_ingested(db, story_id):
            skipped += 1
            continue
        author = post.get("author") or "unknown"
        title = post.get("title") or ""
        text = post.get("story_text") or ""
        url = post.get("url")
        points = post.get("points") or 0
        email = "{}@hn.invalid".format(author.lower())  # synthetic dedup key, clearly not a real address

        founder = find_founder(db, email)
        if founder is None:
            founder = FounderRow(
                id=unique_slug(db, FounderRow, author), name=author, role="Other",
                email=email, location="Not disclosed", expertise=[],
                founder_score=0, score_trend="flat", components=[], history=[],
                contact_status="Discovered", contradiction_count=0,
                bio="Discovered via Show HN. Email not disclosed — synthetic handle key.",
                created_at=_now_iso())
            db.add(founder)
            db.flush()
            created_founder_ids.append(founder.id)
            new_founders += 1
        db.add(SignalRow(founder_id=founder.id, source="Show HN", signal_type="hn_post",
                         raw_json={"story_id": story_id, "title": title, "points": points,
                                   "url": url, "author": author,
                                   "text": "Show HN by '{}' — {} ({} pts)".format(author, title, points)},
                         fetched_at=_now_iso()))
        db.flush()
        last_sig = db.execute(select(SignalRow).order_by(SignalRow.id.desc())).scalars().first()
        if last_sig is not None:
            created_signal_ids.append(last_sig.id)
        new_signals += 1

        if processed >= process_limit:
            skipped += 1  # signal stored; full pipeline deferred to keep the run bounded
            continue
        processed += 1

        gh_links = GITHUB_RE.findall(text or "") + ([url] if url and "github.com" in url else [])
        links = [u for u in ([url] if url else []) + URL_RE.findall(text or "")][:5]
        payload = ApplicationPayload(
            company=_company_from_title(title), tagline=title,
            sector="Not disclosed", stage="Pre-Seed", geography="Not disclosed",
            founders=[ApplicationFounder(name=author, role="Other", email=email,
                                         github=gh_links[0] if gh_links else None)],
            links=links, has_deck=False)
        deal, _, _, errs = await process_application(
            db, payload, source="Outbound — Show HN", new_contact_status="Reviewing")
        errors.extend(errs)
        created_deal_ids.append(deal.id)
        new_deals += 1
        draft = await draft_outreach(
            db, founder.id, deal.id,
            "Show HN post: {} ({} points). {}".format(title, points, text[:800]),
            active_thesis(db), errors)
        founder.contact_status = "Reviewing" if draft else founder.contact_status
        db.commit()

    db.commit()
    return {"newSignals": new_signals, "newFounders": new_founders,
            "newDeals": new_deals, "skipped": skipped, "errors": errors,
            "dealIds": created_deal_ids, "founderIds": created_founder_ids,
            "signalIds": created_signal_ids}
