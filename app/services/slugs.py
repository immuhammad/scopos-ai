import re

from sqlalchemy.orm import Session


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "item"


def unique_slug(db: Session, model, base: str) -> str:
    slug = slugify(base)
    candidate = slug
    n = 2
    while db.get(model, candidate) is not None:
        candidate = "{}-{}".format(slug, n)
        n += 1
    return candidate
