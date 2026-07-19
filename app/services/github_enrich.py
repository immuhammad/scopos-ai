"""GitHub enrichment: user profile + repos as signals. Skips gracefully on
rate limits, missing users, or network failure — returns None, never raises."""
from typing import Any, Dict, Optional

import httpx

from app.config import GITHUB_TOKEN

API = "https://api.github.com"


def handle_from_url(github: Optional[str]) -> Optional[str]:
    if not github:
        return None
    handle = github.strip().rstrip("/")
    if "github.com/" in handle:
        handle = handle.split("github.com/", 1)[1]
    handle = handle.split("/")[0].lstrip("@")
    return handle or None


async def enrich_github(handle: str) -> Optional[Dict[str, Any]]:
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = "Bearer {}".format(GITHUB_TOKEN)
    try:
        async with httpx.AsyncClient(timeout=15, headers=headers) as http:
            user_resp = await http.get("{}/users/{}".format(API, handle))
            if user_resp.status_code != 200:
                return None
            user = user_resp.json()
            repos_resp = await http.get(
                "{}/users/{}/repos".format(API, handle),
                params={"per_page": 100, "sort": "pushed"},
            )
            repos = repos_resp.json() if repos_resp.status_code == 200 else []
    except Exception:  # noqa: BLE001 — enrichment is best-effort
        return None
    if not isinstance(repos, list):
        repos = []
    total_stars = sum(r.get("stargazers_count", 0) for r in repos)
    top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:5]
    return {
        "handle": handle,
        "name": user.get("name"),
        "followers": user.get("followers", 0),
        "public_repos": user.get("public_repos", 0),
        "created_at": user.get("created_at"),
        "total_stars": total_stars,
        "top_repos": [
            {
                "name": r.get("name"),
                "stars": r.get("stargazers_count", 0),
                "description": r.get("description"),
                "pushed_at": r.get("pushed_at"),
                "url": r.get("html_url"),
            }
            for r in top_repos
        ],
    }
