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
                    "license": (
                        repo.get("license", {}).get("spdx_id")
                        if repo.get("license")
                        else None
                    ),
                    "forks_count": repo.get("forks_count", 0),
                    "open_issues_count": repo.get("open_issues_count", 0),
                    "created_at_gh": repo.get("created_at"),
                    "archived": 1 if repo.get("archived") else 0,
                    "size_kb": repo.get("size", 0),
                    "pushed_at": repo.get("pushed_at"),
                    "watchers_count": repo.get("watchers_count", 0),
                    "is_fork": 1 if repo.get("fork") else 0,
                    "owner_type": repo.get("owner", {}).get("type", "User"),
                    "default_branch": repo.get("default_branch"),
                    "has_wiki": 1 if repo.get("has_wiki") else 0,
                    "has_pages": 1 if repo.get("has_pages") else 0,
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
    """Incremental sync: fetch stars, fetch READMEs for new repos only, upsert all.

    Only fetches READMEs for repos not already in the DB. Existing repos are
    still upserted (to update metadata like star counts) but with readme_content=None,
    so the COALESCE in the upsert query preserves the existing README.

    Returns dict with counts: {"total", "new", "updated", "skipped_readmes"}
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch all starred repos
        if on_progress:
            on_progress("fetching", 0, 0)
        repos = await fetch_starred_repos(client)
        total = len(repos)

        if on_progress:
            on_progress("fetching", total, total)

        # 2. Query DB for existing repos to determine which need READMEs
        with get_db() as conn:
            existing_names = {
                row[0] for row in conn.execute("SELECT full_name FROM repos").fetchall()
            }

        new_repos = [r for r in repos if r["full_name"] not in existing_names]
        existing_repos = [r for r in repos if r["full_name"] in existing_names]

        logger.info(
            "Incremental sync: %d total, %d new, %d existing",
            total,
            len(new_repos),
            len(existing_repos),
        )

        # 3. Fetch READMEs only for new repos
        if on_progress:
            on_progress("readmes", 0, len(new_repos))
        readmes = await fetch_readmes(client, new_repos)
        if on_progress:
            on_progress("readmes", len(readmes), len(new_repos))

        # 4. Attach READMEs and upsert ALL repos to DB
        if on_progress:
            on_progress("storing", 0, total)

        new_count = 0
        updated_count = 0

        with get_db() as conn:
            for i, repo in enumerate(repos):
                if repo["full_name"] in existing_names:
                    # Existing repo: pass None so COALESCE preserves existing README
                    repo["readme_content"] = None
                    updated_count += 1
                else:
                    # New repo: attach fetched README (may be None if fetch failed)
                    repo["readme_content"] = readmes.get(repo["full_name"])
                    new_count += 1

                upsert_repo(conn, repo)

                if on_progress and (i + 1) % 10 == 0:
                    on_progress("storing", i + 1, total)

        if on_progress:
            on_progress("storing", total, total)

        return {
            "total": total,
            "new": new_count,
            "updated": updated_count,
            "skipped_readmes": len(existing_repos),
        }


def compute_health_scores() -> int:
    """Compute health scores for all repos. Returns count updated."""
    import math
    from datetime import datetime, timezone

    count = 0
    now = datetime.now(timezone.utc)

    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, pushed_at, stargazers_count, forks_count,
                   open_issues_count, has_wiki, has_pages, archived
            FROM repos
        """).fetchall()

        for row in rows:
            score = 0.0

            # Recency of last push (40 points max)
            pushed_at = row["pushed_at"]
            if pushed_at:
                try:
                    pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
                    days_ago = (now - pushed).days
                    if days_ago < 7:
                        score += 40
                    elif days_ago < 30:
                        score += 35
                    elif days_ago < 90:
                        score += 25
                    elif days_ago < 180:
                        score += 15
                    elif days_ago < 365:
                        score += 8
                    else:
                        score += 2
                except Exception:
                    score += 5  # unknown = low

            # Star count (20 points max, logarithmic)
            stars = row["stargazers_count"] or 0
            if stars > 0:
                star_score = min(20, math.log10(stars + 1) * 5)
                score += star_score

            # Fork/star ratio -- community engagement (10 points)
            forks = row["forks_count"] or 0
            if stars > 0:
                ratio = forks / stars
                if ratio > 0.3:
                    score += 10
                elif ratio > 0.1:
                    score += 7
                elif ratio > 0.05:
                    score += 4
                else:
                    score += 2

            # Issue management (10 points)
            issues = row["open_issues_count"] or 0
            if stars > 100:
                issue_ratio = issues / stars
                if issue_ratio < 0.01:
                    score += 10  # well managed
                elif issue_ratio < 0.05:
                    score += 7
                elif issue_ratio < 0.1:
                    score += 4
                else:
                    score += 1
            else:
                score += 5  # small projects get neutral

            # Has wiki (5 points)
            if row["has_wiki"]:
                score += 5

            # Has pages (5 points)
            if row["has_pages"]:
                score += 5

            # Not archived (10 points)
            if not row["archived"]:
                score += 10

            final_score = min(100, max(0, int(round(score))))
            conn.execute(
                "UPDATE repos SET health_score = ? WHERE id = ?",
                (final_score, row["id"]),
            )
            count += 1

    return count
