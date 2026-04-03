"""RAG chat service: retrieve relevant repos, then generate a response with Claude."""

import logging
from typing import Any

import anthropic

from starz.config import settings
from starz.db.client import get_db, get_stats
from starz.services.search import search as search_repos

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Starz, a personal GitHub stars search assistant. The user has starred repositories on GitHub and wants to find or learn about them.

You will be given the most relevant starred repos matching the user's question. Use them to answer naturally.

Guidelines:
- Include repo names formatted as **owner/repo** with their GitHub URL
- Be concise and helpful
- If no repos match well, say so honestly
- Group results by category when listing multiple repos
- Include the repo's description and why it's relevant to the question"""


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _format_repo_context(repos: list[dict]) -> str:
    """Format repos as context for the LLM."""
    lines = []
    for i, r in enumerate(repos, 1):
        parts = [f"{i}. **{r['full_name']}** ({r.get('html_url', '')})"]
        if r.get("category"):
            parts.append(f"   Category: {r['category']}")
        if r.get("description"):
            parts.append(f"   Description: {r['description']}")
        if r.get("language"):
            parts.append(f"   Language: {r['language']}")
        if r.get("summary"):
            parts.append(f"   Summary: {r['summary']}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


def chat(
    query: str,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """RAG chat: retrieve relevant repos, then generate a response.

    Returns: {"answer": str, "sources": [{"full_name", "html_url", "category", "summary"}]}
    """
    client = _get_client()

    # 1. Retrieve relevant repos
    relevant_repos = search_repos(query, limit=10)

    # 2. Get total stats for context
    with get_db() as conn:
        stats = get_stats(conn)

    # 3. Build context
    context = _format_repo_context(relevant_repos)

    user_content = f"""The user has {stats["total"]} starred repos in total.

Here are the most relevant starred repos for the question:

{context}

User question: {query}"""

    # 4. Build messages
    messages: list[dict[str, str]] = []
    if history:
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_content})

    # 5. Call Claude
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    answer = response.content[0].text

    # 6. Build sources list
    sources = []
    for r in relevant_repos[:5]:  # Top 5 sources
        sources.append(
            {
                "full_name": r["full_name"],
                "html_url": r.get("html_url", ""),
                "category": r.get("category"),
                "summary": r.get("summary"),
            }
        )

    return {"answer": answer, "sources": sources}
