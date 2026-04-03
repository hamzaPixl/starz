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

    prompt = f"""Analyze this GitHub starred repos collection and produce a structured landscape report in markdown.

{f"Focus on: {topic}" if topic else "Cover the entire collection."}

Collection data:
{context}

Write the report with these sections:
## Overview
Brief summary of the collection's focus and depth.

## Key Repos
The most notable/important repos, grouped by sub-category. Include stars and health score.

## Themes & Patterns
What recurring themes, technology choices, or interests emerge?

## Gaps & Recommendations
What's missing? What complementary tools should the user explore?

## Trend Signals
Based on the repos, what technology trends is this person tracking?

Keep it concise, data-driven, and actionable. Use the actual repo names and data provided."""

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

    prompt = f"""Deep-dive analysis of "{topic}" repos in this GitHub stars collection.

{context}

Write a detailed analysis in markdown:
## Overview
What does this person's {topic} collection look like?

## Tool Comparison
Compare the alternatives — if there are multiple repos solving similar problems, how do they differ?

## Recommended Stack
Based on what's starred, what's the optimal combination?

## What's Missing
What important {topic} tools should they explore?

Be specific — reference actual repo names and their characteristics."""

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
