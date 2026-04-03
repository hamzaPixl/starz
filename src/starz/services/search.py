"""Combined semantic (vector) + keyword search over starred repos."""

import json
import logging
from typing import Any

from starz.db.client import get_db
from starz.services.embeddings import query_similar

logger = logging.getLogger(__name__)


def keyword_search(conn, query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Search repos by keyword matching on name, description, language, and topics."""
    q_lower = query.lower()
    words = q_lower.split()

    # Build conditions for each word
    conditions = []
    params: list[Any] = []
    for word in words:
        like = f"%{word}%"
        conditions.append(
            "(LOWER(name) LIKE ? OR LOWER(description) LIKE ? "
            "OR LOWER(language) LIKE ? OR LOWER(topics) LIKE ?)"
        )
        params.extend([like, like, like, like])

    if not conditions:
        return []

    where = " AND ".join(conditions)
    rows = conn.execute(
        f"SELECT * FROM repos WHERE {where} ORDER BY stargazers_count DESC LIMIT ?",
        params + [limit],
    ).fetchall()

    results = []
    for row in rows:
        repo = dict(row)
        repo["topics"] = json.loads(repo["topics"]) if repo.get("topics") else []
        repo["score"] = 0.5  # keyword matches get a base score
        results.append(repo)
    return results


def merge_results(
    vector_results: list[dict], keyword_results: list[dict], max_results: int = 10
) -> list[dict]:
    """Merge and deduplicate vector + keyword results, preferring vector scores."""
    seen: dict[str, dict] = {}

    # Vector results first (higher priority)
    for r in vector_results:
        key = r["full_name"]
        if key not in seen:
            seen[key] = r

    # Keyword results fill remaining slots, boost if already in vector results
    for r in keyword_results:
        key = r["full_name"]
        if key in seen:
            # Boost score for repos found by both methods
            seen[key]["score"] = min(1.0, seen[key].get("score", 0) + 0.2)
        else:
            seen[key] = r

    # Sort by score descending
    merged = sorted(seen.values(), key=lambda x: x.get("score", 0), reverse=True)
    return merged[:max_results]


def search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Combined semantic + keyword search."""
    # 1. Vector search (if embeddings exist)
    try:
        vector_results = query_similar(query, limit=limit)
    except Exception as e:
        logger.warning(f"Vector search failed: {e}")
        vector_results = []

    # 2. Keyword search
    with get_db() as conn:
        keyword_results = keyword_search(conn, query, limit=limit)

    # 3. Merge
    return merge_results(vector_results, keyword_results, max_results=limit)
