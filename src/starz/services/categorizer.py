"""Claude Haiku batch categorization service for GitHub repositories."""

import json
import logging
import anthropic

from starz.config import settings
from starz.db.client import get_db

logger = logging.getLogger(__name__)

CATEGORIES = [
    "Frontend Framework",
    "Backend Framework",
    "CLI Tool",
    "ML/AI Library",
    "DevOps/Infrastructure",
    "Database/Storage",
    "UI Component Library",
    "Programming Language/Runtime",
    "Testing Tool",
    "Documentation/Static Site",
    "Security Tool",
    "Data Processing",
    "Mobile Development",
    "Developer Productivity",
    "Other",
]

SYSTEM_PROMPT = f"""You are a GitHub repository categorizer. Given a list of repositories, classify each into exactly one category, write a 2-3 sentence summary, and assign 2-3 specific sub-tags.

Available categories: {", ".join(CATEGORIES)}

Sub-tags should be more specific than GitHub topics. Examples:
- ML/AI Library: ["nlp", "text-generation", "fine-tuning"]
- Frontend Framework: ["react", "ssr", "routing"]
- CLI Tool: ["terminal-ui", "file-management", "developer-workflow"]

Respond with a JSON array. Each element must have:
- "full_name": the repository full name (exactly as provided)
- "category": one of the listed categories
- "summary": 2-3 sentences describing what the repo does and why it's useful
- "sub_tags": an array of 2-3 specific sub-tags for the repo

Only output valid JSON, nothing else."""


def _get_client() -> anthropic.Anthropic:
    """Create an Anthropic client using the configured API key."""
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _build_repo_description(repo: dict) -> str:
    """Build a concise description for categorization."""
    parts = [f"{repo['full_name']}"]
    if repo.get("description"):
        parts.append(f"- {repo['description']}")
    if repo.get("language"):
        parts.append(f"(Language: {repo['language']})")
    topics = repo.get("topics")
    if topics:
        if isinstance(topics, str):
            topics = json.loads(topics)
        if topics:
            parts.append(f"[Topics: {', '.join(topics[:10])}]")
    return " ".join(parts)


def categorize_batch(
    client: anthropic.Anthropic, repos: list[dict]
) -> list[dict[str, str]]:
    """Categorize a batch of repos using Claude Haiku.

    Returns list of {full_name, category, summary}.
    Raises on API or JSON parse errors so the caller can skip the batch.
    """
    descriptions = []
    for i, repo in enumerate(repos, 1):
        descriptions.append(f"{i}. {_build_repo_description(repo)}")

    user_msg = "Categorize these repositories:\n\n" + "\n".join(descriptions)

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    # Parse JSON response
    text = message.content[0].text.strip()
    # Handle potential markdown code block wrapping
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse categorization JSON response: %s", e)
        logger.debug("Raw response: %s", text[:500])
        raise

    return parsed


def categorize_repos(on_progress: callable | None = None) -> int:
    """Categorize all uncategorized repos. Returns count categorized."""
    client = _get_client()
    count = 0
    batch_size = 20

    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, full_name, description, language, topics FROM repos WHERE category IS NULL"
        ).fetchall()

        if not rows:
            return 0

        total = len(rows)
        repos = [dict(r) for r in rows]

        for i in range(0, total, batch_size):
            batch = repos[i : i + batch_size]

            try:
                results = categorize_batch(client, batch)

                # Map results by full_name
                result_map = {r["full_name"]: r for r in results}

                for repo in batch:
                    result = result_map.get(repo["full_name"])
                    if result:
                        category = result.get("category", "Other")
                        # Validate category
                        if category not in CATEGORIES:
                            category = "Other"
                        summary = result.get("summary", "")
                        sub_tags = result.get("sub_tags", [])

                        conn.execute(
                            "UPDATE repos SET category = ?, summary = ?, sub_tags = ? WHERE full_name = ?",
                            (
                                category,
                                summary,
                                json.dumps(sub_tags),
                                repo["full_name"],
                            ),
                        )
                        count += 1

                if on_progress:
                    on_progress("categorizing", min(i + batch_size, total), total)

            except Exception as e:
                logger.error(f"Failed to categorize batch starting at index {i}: {e}")
                continue

    return count
