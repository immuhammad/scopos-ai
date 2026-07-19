"""Outbound sourcing via Hacker News Algolia (Show HN + Launch HN, last 30d).

Scans create LEADS, not decision-ready deals: a real founder record, real
signals (the actual post, points, links), a Sourced-stage deal with NO claims,
NO axis scores, NO memo — just a signal-strength read and an outreach draft.
Convergence to the inbound pipeline happens only when an application arrives
(or is explicitly simulated for demo). Messages are never actually sent."""
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DealFounderRow, DealRow, FounderRow, SignalRow
from app.services.founder_score import recompute_founder_score
from app.services.github_enrich import enrich_github, handle_from_url
from app.services.outreach import draft_outreach
from app.services.pipeline import active_thesis, find_founder
from app.services.slugs import unique_slug
from app.services.trace import record_trace

ALGOLIA = "https://hn.algolia.com/api/v1/search_by_date"
GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _company_from_title(title: str) -> str:
    t = re.sub(r"^(Show|Launch) HN:?\s*", "", title or "", flags=re.I).strip()
    t = re.split(r"\s+[–—-]\s+|:\s+", t)[0].strip()
    return (t or "").strip()[:60]


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
                "errors": ["HN Algolia unreachable: {}".format(exc)],
                "dealIds": [], "founderIds": [], "signalIds": []}

    new_signals = new_founders = new_deals = skipped = 0
    leads_created = 0
    created_deal_ids: List[str] = []
    created_founder_ids: List[str] = []
    created_signal_ids: List[int] = []
    now = _now_iso()

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
        company = _company_from_title(title)
        if not company or company.lower() in ("show hn", "launch hn"):
            skipped += 1  # unparseable title — not a usable lead
            continue
        email = "{}@hn.invalid".format(author.lower())  # synthetic dedup key, clearly not a real address

        founder = find_founder(db, email)
        if founder is None:
            founder = FounderRow(
                id=unique_slug(db, FounderRow, author), name=author, role="Other",
                email=email, location="Not disclosed", expertise=[],
                founder_score=0, score_trend="flat", components=[], history=[],
                contact_status="Discovered", contradiction_count=0,
                bio="Discovered via Show HN. Email not disclosed — synthetic handle key.",
                created_at=now)
            db.add(founder)
            db.flush()
            created_founder_ids.append(founder.id)
            new_founders += 1

        sig = SignalRow(founder_id=founder.id, source="Show HN", signal_type="hn_post",
                        raw_json={"story_id": story_id, "title": title, "points": points,
                                  "url": url, "author": author,
                                  "item_url": "https://news.ycombinator.com/item?id={}".format(story_id),
                                  "text": "Show HN by '{}' — {} ({} pts)".format(author, title, points),
                                  "story_text": text[:4000]},
                        fetched_at=now)
        db.add(sig)
        db.flush()
        created_signal_ids.append(sig.id)
        new_signals += 1

        if leads_created >= process_limit:
            skipped += 1  # signal stored; lead creation deferred to keep the run bounded
            continue
        leads_created += 1

        # LEAD deal: Sourced stage, real links only — no claims, no axes, no memo.
        gh_links = GITHUB_RE.findall(text or "") + ([url] if url and "github.com" in url else [])
        deal_id = unique_slug(db, DealRow, company)
        links = [{"label": "Show HN post",
                  "href": "https://news.ycombinator.com/item?id={}".format(story_id)}]
        if url:
            links.append({"label": _link_label(url), "href": url})
        if gh_links and not any("github.com" in (l["href"] or "") for l in links):
            links.append({"label": "GitHub", "href": gh_links[0]})
        deal = DealRow(
            id=deal_id, company=company, tagline=title,
            sector="Not disclosed", stage="Pre-Seed", geography="Not disclosed",
            source="Outbound — Show HN", pipeline_stage="Sourced",
            stage_started_at=now, first_signal_at=now,
            next_action="Review lead footprint and send outreach.",
            links=links, created_at=now,
            decision_deadline=(datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
            errors=[])
        db.add(deal)
        db.add(DealFounderRow(deal_id=deal_id, founder_id=founder.id, lead=True,
                              role=founder.role))
        sig.deal_id = deal_id
        db.flush()
        created_deal_ids.append(deal_id)
        new_deals += 1

        if founder.github is None and gh_links:
            founder.github = gh_links[0]
        handle = handle_from_url(founder.github)
        if handle:
            data = await enrich_github(handle)
            if data is not None:
                db.add(SignalRow(founder_id=founder.id, deal_id=deal_id, source="GitHub API",
                                 signal_type="github_profile", raw_json=data, fetched_at=now))
                db.flush()
        recompute_founder_score(db, founder, "Discovered via Show HN: {}".format(company))
        record_trace(db, deal_id, "lead-created", "",
                     "Outbound lead from real Show HN post ({} pts) — no claims/axes until an application arrives".format(points))
        await draft_outreach(
            db, founder.id, deal_id,
            "Show HN post: {} ({} points). {}".format(title, points, text[:800]),
            active_thesis(db), errors)
        db.commit()

    db.commit()
    return {"newSignals": new_signals, "newFounders": new_founders,
            "newDeals": new_deals, "skipped": skipped, "errors": errors,
            "dealIds": created_deal_ids, "founderIds": created_founder_ids,
            "signalIds": created_signal_ids}


def _link_label(url: str) -> str:
    low = url.lower()
    if "github.com" in low:
        return "GitHub"
    if "news.ycombinator" in low:
        return "Show HN post"
    return "Website"
