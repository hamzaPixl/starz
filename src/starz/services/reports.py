"""Report generation service — AI-powered analysis of starred collection."""

import json
import logging

import anthropic

from starz.config import settings
from starz.db.client import get_db

logger = logging.getLogger(__name__)


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _build_collection_context(category: str | None = None) -> str:
    """Build a context string summarizing the relevant repos."""
    with get_db() as conn:
        if category:
            rows = conn.execute(
                "SELECT full_name, description, language, category, summary, sub_tags, stargazers_count, health_score FROM repos WHERE category = ? ORDER BY stargazers_count DESC",
                (category,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT full_name, description, language, category, summary, sub_tags, stargazers_count, health_score FROM repos ORDER BY stargazers_count DESC"
            ).fetchall()

        # Stats
        total = len(rows)
        cats: dict[str, int] = {}
        langs: dict[str, int] = {}
        for r in rows:
            cat = r["category"] or "Other"
            lang = r["language"] or "Unknown"
            cats[cat] = cats.get(cat, 0) + 1
            langs[lang] = langs.get(lang, 0) + 1

        lines = [f"Collection: {total} repos"]
        lines.append(
            f"Categories: {json.dumps(dict(sorted(cats.items(), key=lambda x: -x[1])[:10]))}"
        )
        lines.append(
            f"Languages: {json.dumps(dict(sorted(langs.items(), key=lambda x: -x[1])[:10]))}"
        )
        lines.append("")

        for r in rows[:50]:  # Top 50 by stars
            sub = json.loads(r["sub_tags"]) if r["sub_tags"] else []
            sub_suffix = f" [sub: {', '.join(sub)}]" if sub else ""
            lines.append(
                f"- {r['full_name']} ({r['language'] or '?'}, "
                f"\u2605{r['stargazers_count']}, health:{r['health_score']}): "
                f"{r['description'] or r['summary'] or 'No description'}"
                f"{sub_suffix}"
            )

    return "\n".join(lines)


def generate_landscape_report(topic: str | None = None) -> str:
    """Generate a markdown landscape report about the collection."""
    client = _get_client()

    context = _build_collection_context(category=topic)

    prompt = f"""You are a technical analyst. Analyze this GitHub starred repos collection and write a polished landscape report.

{f"Focus area: **{topic}**" if topic else "Scope: the entire collection."}

Collection data:
{context}

Write a clean, well-structured markdown report following this format exactly:

# {"Collection" if not topic else topic} Landscape Report

> One-line summary of the collection's focus.

## At a Glance

| Metric | Value |
|--------|-------|
| Total repos | ... |
| Top language | ... |
| Strongest area | ... |
| Health | X% thriving |

## Highlights

The 5-8 most important repos as a table:

| Repo | What it does | Stars | Health |
|------|-------------|-------|--------|
| **owner/name** | One-sentence description | Xk | XX% |

## Themes

3-4 key themes you observe, each as a short paragraph with specific repo names as evidence.

## Stack Coverage

What technology areas are well-covered and what's missing. Be specific — name tools that would fill gaps.

## Signals

2-3 technology trends this person appears to be tracking, with evidence from the repos.

---

Rules:
- Use **bold** for repo names, format stars as Xk
- Keep descriptions to one sentence
- Be specific, not generic. Reference actual repos.
- Tables must be valid markdown
- No filler phrases like "This is a comprehensive collection"
- Total length: 400-600 words"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


def generate_deep_dive(topic: str) -> str:
    """Generate a deep-dive analysis for a specific topic/category."""
    client = _get_client()

    context = _build_collection_context(category=topic)

    if "Collection: 0" in context:
        # Try topic-based search instead of category
        with get_db() as conn:
            rows = conn.execute(
                "SELECT full_name, description, language, category, summary, sub_tags, stargazers_count, health_score "
                "FROM repos WHERE topics LIKE ? OR description LIKE ? OR name LIKE ? "
                "ORDER BY stargazers_count DESC LIMIT 30",
                (f"%{topic}%", f"%{topic}%", f"%{topic}%"),
            ).fetchall()

            lines = [f"Topic search '{topic}': {len(rows)} repos"]
            for r in rows:
                sub = json.loads(r["sub_tags"]) if r["sub_tags"] else []
                sub_suffix = f" [sub: {', '.join(sub)}]" if sub else ""
                lines.append(
                    f"- {r['full_name']} ({r['language'] or '?'}, "
                    f"\u2605{r['stargazers_count']}, health:{r['health_score']}): "
                    f"{r['description'] or r['summary'] or ''}"
                    f"{sub_suffix}"
                )
            context = "\n".join(lines)

    prompt = f"""You are a technical analyst. Deep-dive into "{topic}" repos in this starred collection.

{context}

Write a polished markdown report following this format:

# {topic} Deep Dive

> One-line summary of coverage.

## Inventory

Table of all relevant repos:

| Repo | Purpose | Stars | Health | Language |
|------|---------|-------|--------|----------|
| **owner/name** | What it solves | Xk | XX% | Lang |

## Head-to-Head

If there are alternatives that solve similar problems, compare them:

| Feature | Repo A | Repo B |
|---------|--------|--------|
| Approach | ... | ... |
| Best for | ... | ... |

## Recommended Stack

The optimal combination from what's starred. Explain why each piece fits.

## Gaps

What's missing? Name specific tools or categories that would round out the {topic} toolkit.

---

Rules:
- Use **bold** for repo names
- Tables must be valid markdown
- Be specific — every claim needs a repo name
- No filler. Facts only.
- 300-500 words"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


def generate_digest(days: int = 7) -> dict:
    """Generate a weekly digest of starring activity."""
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    with get_db() as conn:
        # New stars
        new_stars = conn.execute(
            "SELECT full_name, description, category, language, stargazers_count, health_score "
            "FROM repos WHERE starred_at >= ? ORDER BY starred_at DESC",
            (cutoff,),
        ).fetchall()

        # Top categories in recent stars
        cats: dict[str, int] = {}
        for r in new_stars:
            cat = r["category"] or "Other"
            cats[cat] = cats.get(cat, 0) + 1

        # Stale repos (health < 30)
        stale = conn.execute(
            "SELECT full_name, health_score, pushed_at FROM repos "
            "WHERE health_score < 30 ORDER BY health_score ASC LIMIT 10"
        ).fetchall()

        # Top new star by stars
        top_new = new_stars[0] if new_stars else None

    return {
        "period_days": days,
        "new_stars_count": len(new_stars),
        "new_stars": [dict(r) for r in new_stars[:10]],
        "trending_categories": dict(sorted(cats.items(), key=lambda x: -x[1])[:5]),
        "top_new_star": dict(top_new) if top_new else None,
        "stale_repos": [dict(r) for r in stale],
    }
