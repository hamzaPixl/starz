"""GitHub stars fetching and README extraction service."""

import asyncio
import base64
import logging
from typing import Any

import httpx

from starz.config import settings
from starz.db.client import get_db, upsert_repo

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
STARRED_ACCEPT = "application/vnd.github.star+json"


def _headers() -> dict[str, str]:
    """Build headers for GitHub API requests."""
    h: dict[str, str] = {"Accept": STARRED_ACCEPT}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h


async def fetch_starred_repos(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch all starred repos with pagination (100 per page)."""
    repos: list[dict[str, Any]] = []
    page = 1
    while True:
        try:
            resp = await client.get(
                f"{GITHUB_API}/user/starred",
                params={"per_page": 100, "page": page},
                headers=_headers(),
            )
            resp.raise_for_status()
            data = resp.json()
        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            logger.error("Failed to fetch starred repos page %d: %s", page, e)
            break
        except Exception as e:
            logger.error("Unexpected error fetching starred repos page %d: %s", page, e)
            break
        if not data:
            break
        for item in data:
            repo = item["repo"]
            repos.append(
                {
                    "full_name": repo["full_name"],
                    "name": repo["name"],
                    "owner": repo["owner"]["login"],
                    "description": repo.get("description"),
                    "language": repo.get("language"),
                    "topics": repo.get("topics", []),
                    "stargazers_count": repo.get("stargazers_count", 0),
                    "html_url": repo["html_url"],
                    "homepage": repo.get("homepage"),
                    "updated_at": repo.get("updated_at"),
                    "starred_at": item.get("starred_at"),
                }
            )
        page += 1
    return repos


async def fetch_readme(client: httpx.AsyncClient, full_name: str) -> str | None:
    """Fetch README for a repo, return content truncated to 4000 chars."""
    try:
        resp = await client.get(
            f"{GITHUB_API}/repos/{full_name}/readme",
            headers=(
                {"Authorization": f"Bearer {settings.github_token}"}
                if settings.github_token
                else {}
            ),
            timeout=5.0,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        content = base64.b64decode(data.get("content", "")).decode(
            "utf-8", errors="replace"
        )
        return content[:4000]
    except (httpx.TimeoutException, httpx.HTTPError, Exception) as e:
        logger.debug("Failed to fetch README for %s: %s", full_name, e)
        return None


async def fetch_readmes(
    client: httpx.AsyncClient, repos: list[dict], concurrency: int = 10
) -> dict[str, str]:
    """Fetch READMEs in parallel with semaphore-limited concurrency."""
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, str] = {}

    async def _fetch(full_name: str) -> None:
        async with sem:
            content = await fetch_readme(client, full_name)
            if content:
                results[full_name] = content

    await asyncio.gather(*[_fetch(r["full_name"]) for r in repos])
    return results


async def sync_from_github(
    on_progress: callable | None = None,
) -> dict[str, int]:
    """Full sync: fetch stars, fetch READMEs, upsert to DB.

    Returns dict with counts: {"total": N, "new": N, "updated": N}
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch all starred repos
        if on_progress:
            on_progress("fetching", 0, 0)
        repos = await fetch_starred_repos(client)
        total = len(repos)

        if on_progress:
            on_progress("fetching", total, total)

        # 2. Fetch READMEs for all repos (incremental optimization later)
        if on_progress:
            on_progress("readmes", 0, total)
        readmes = await fetch_readmes(client, repos)
        if on_progress:
            on_progress("readmes", len(readmes), total)

        # 3. Attach READMEs and upsert to DB
        if on_progress:
            on_progress("storing", 0, total)

        new_count = 0
        updated_count = 0

        with get_db() as conn:
            existing = {
                row[0] for row in conn.execute("SELECT full_name FROM repos").fetchall()
            }

            for i, repo in enumerate(repos):
                repo["readme_content"] = readmes.get(repo["full_name"])
                upsert_repo(conn, repo)

                if repo["full_name"] in existing:
                    updated_count += 1
                else:
                    new_count += 1

                if on_progress and (i + 1) % 10 == 0:
                    on_progress("storing", i + 1, total)

        if on_progress:
            on_progress("storing", total, total)

        return {"total": total, "new": new_count, "updated": updated_count}
