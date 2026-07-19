"""Tier-1 deterministic pre-screen — the zero-cost gate in two-tier screening.

Runs inside POST /applications BEFORE any LLM call. Obvious junk (placeholder
or keyboard-mash names, near-empty submissions, <24h duplicate resubmissions)
is stored as a non-viable deal with a model-free `prescreen` trace step and
never reaches the tier-2 LLM viability filter — no founder records created,
no model quota spent. Thin-but-genuine applications must PASS: this tier only
rejects what a reviewer would bin at a glance; anything judgment-shaped stays
with the LLM. A single valid link or an attached deck/CV counts as enough
content — cold-start founders with just a GitHub URL are first-class."""
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DealFounderRow, DealRow, FounderRow
from app.schemas import ApplicationPayload
from app.services.slugs import slugify

PLACEHOLDER_NAMES = frozenset((
    "test", "testing", "tester", "test company", "asdf", "qwerty", "azerty",
    "abc", "xyz", "foo", "bar", "baz", "foobar", "none", "n/a", "na", "nil",
    "null", "undefined", "unknown", "todo", "tbd", "xxx", "aaa",
    "company", "startup", "my company", "my startup", "string", "name"))
MIN_CONTENT_CHARS = 40
DUPLICATE_WINDOW_HOURS = 24
_URL = re.compile(r"https?://\S+")


def _letters(text: str) -> str:
    return re.sub(r"[^A-Za-z]", "", text or "")


def _meaningful(text: str) -> int:
    """Alphanumeric characters excluding URLs — content a screener can read."""
    return len(re.sub(r"[^A-Za-z0-9]", "", _URL.sub("", text or "")))


def _keyboard_mash(text: str) -> bool:
    """True for strings a human reads as mashed keys: one character repeated
    4+ times in a row, or a 6+ letter run with no vowel anywhere."""
    if re.search(r"(.)\1{3,}", text or ""):
        return True
    letters = _letters(text).lower()
    return len(letters) >= 6 and not re.search(r"[aeiouy]", letters)


def _placeholder(text: str) -> bool:
    return (text or "").strip().lower() in PLACEHOLDER_NAMES


def _parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(dt_str)
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _recent_duplicate(db: Session, payload: ApplicationPayload) -> Optional[DealRow]:
    """Same company slug + same lead-founder email, submitted <24h ago.
    Matches through the lead DealFounderRow link, so only deals that actually
    entered the funnel count — junk that never made founder records can't
    shadow a later genuine application."""
    lead_email = (payload.founders[0].email or "").strip().lower() if payload.founders else ""
    if not lead_email:
        return None
    company_slug = slugify(payload.company or "")
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DUPLICATE_WINDOW_HOURS)
    for deal in db.execute(select(DealRow)).scalars().all():
        if slugify(deal.company or "") != company_slug:
            continue
        created = _parse_iso(deal.created_at)
        if created is None or created < cutoff:
            continue
        link = db.execute(select(DealFounderRow).where(
            DealFounderRow.deal_id == deal.id,
            DealFounderRow.lead.is_(True))).scalars().first()
        if link is None:
            continue
        founder = db.get(FounderRow, link.founder_id)
        if founder is not None and (founder.email or "").strip().lower() == lead_email:
            return deal
    return None


def prescreen_application(db: Session, payload: ApplicationPayload) -> Optional[str]:
    """Returns a rejection reason, or None when the application may proceed
    to the tier-2 LLM viability filter. Deterministic only — no model calls."""
    company = (payload.company or "").strip()
    if len(_letters(company)) < 2:
        return "Company name is missing or has no letters."
    if _placeholder(company) or _keyboard_mash(company):
        return "Company name '{}' looks like a placeholder or keyboard mash.".format(company[:40])

    named = [f for f in payload.founders
             if len(_letters(f.name)) >= 2 and not _placeholder(f.name)
             and not _keyboard_mash(f.name)]
    if not named:
        return ("No founder with a usable name — a 24-hour decision needs at "
                "least one identifiable founder.")

    duplicate = _recent_duplicate(db, payload)
    if duplicate is not None:
        return ("Duplicate submission: '{}' with the same lead-founder email was "
                "already received in the last {} hours (deal '{}').").format(
                    company, DUPLICATE_WINDOW_HOURS, duplicate.id)

    has_attachment = bool(payload.deck_file or payload.cv_file or
                          payload.deck_text or payload.cv_text)
    has_link = any(u.strip().lower().startswith(("http://", "https://"))
                   for u in payload.links)
    text_chars = _meaningful(payload.tagline) + _meaningful(payload.deck_text) + \
        _meaningful(payload.cv_text)
    if not has_attachment and not has_link and text_chars < MIN_CONTENT_CHARS:
        return ("Not enough content for a 24-hour decision — add a tagline, "
                "pitch deck, CV, or at least one link.")

    tagline = (payload.tagline or "").strip()
    if tagline:
        tokens = [t for t in re.split(r"\s+", _URL.sub("", tagline)) if _letters(t)]
        if tokens and len([t for t in tokens if _keyboard_mash(t)]) * 2 >= len(tokens):
            return "Tagline reads as keyboard mash — filtered as spam."

    return None
