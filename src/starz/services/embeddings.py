"""OpenAI embedding generation + sqlite-vec storage and similarity search."""

import json
import logging
import struct

from openai import OpenAI

from starz.config import settings
from starz.db.client import get_db

logger = logging.getLogger(__name__)

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


def _get_client() -> OpenAI:
    """Create an OpenAI client using the configured API key."""
    return OpenAI(api_key=settings.openai_api_key)


def build_embedding_text(repo: dict) -> str:
    """Build the text to embed for a repo.

    Combines full_name, description, language, topics, and a truncated
    readme into a single pipe-separated string suitable for embedding.
    """
    parts = [repo.get("full_name", "")]
    if repo.get("description"):
        parts.append(repo["description"])
    if repo.get("language"):
        parts.append(f"Language: {repo['language']}")
    topics = repo.get("topics")
    if topics:
        if isinstance(topics, str):
            topics = json.loads(topics)
        if topics:
            parts.append(f"Topics: {', '.join(topics)}")
    if repo.get("readme_content"):
        parts.append(repo["readme_content"][:3000])
    return " | ".join(parts)


def _serialize_embedding(embedding: list[float]) -> bytes:
    """Serialize embedding to bytes for sqlite-vec."""
    return struct.pack(f"{len(embedding)}f", *embedding)


def embed_texts(texts: list[str], client: OpenAI | None = None) -> list[list[float]]:
    """Generate embeddings for a list of texts using OpenAI.

    Raises on API errors so callers can handle them (e.g. skip the batch).
    """
    if not client:
        client = _get_client()
    response = client.embeddings.create(input=texts, model=MODEL)
    return [item.embedding for item in response.data]


def embed_repos(on_progress: callable | None = None) -> int:
    """Generate embeddings for all repos that don't have one yet.

    Returns the count of repos embedded.
    """
    client = _get_client()
    count = 0

    with get_db() as conn:
        # Find repos without embeddings
        rows = conn.execute(
            """
            SELECT r.id, r.full_name, r.description, r.language, r.topics,
                   r.readme_content
            FROM repos r
            LEFT JOIN repo_embeddings e ON r.id = e.repo_id
            WHERE e.repo_id IS NULL
        """
        ).fetchall()

        if not rows:
            return 0

        total = len(rows)
        batch_size = 50  # OpenAI supports up to 2048 inputs per request

        for i in range(0, total, batch_size):
            batch = rows[i : i + batch_size]
            texts = []
            repo_ids = []

            for row in batch:
                repo = dict(row)
                text = build_embedding_text(repo)
                texts.append(text)
                repo_ids.append(repo["id"])

            try:
                embeddings = embed_texts(texts, client)

                for repo_id, text, embedding in zip(repo_ids, texts, embeddings):
                    serialized = _serialize_embedding(embedding)
                    conn.execute(
                        "INSERT OR REPLACE INTO repo_embeddings (repo_id, embedding) VALUES (?, ?)",
                        (repo_id, serialized),
                    )
                    conn.execute(
                        "UPDATE repos SET embedding_text = ? WHERE id = ?",
                        (text, repo_id),
                    )
                    count += 1

                if on_progress:
                    on_progress("embedding", min(i + batch_size, total), total)

            except Exception as e:
                logger.error(f"Failed to embed batch starting at index {i}: {e}")
                continue

    return count


def query_similar(query: str, limit: int = 10) -> list[dict]:
    """Find repos most similar to a query string.

    Returns an empty list if the embedding API call fails.
    """
    try:
        client = _get_client()
        response = client.embeddings.create(input=[query], model=MODEL)
        query_embedding = response.data[0].embedding
    except Exception as e:
        logger.error("Failed to generate query embedding: %s", e)
        return []

    query_bytes = _serialize_embedding(query_embedding)

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT r.*, e.distance
            FROM repo_embeddings e
            INNER JOIN repos r ON r.id = e.repo_id
            WHERE e.embedding MATCH ?
            ORDER BY e.distance
            LIMIT ?
        """,
            (query_bytes, limit),
        ).fetchall()

        results = []
        for row in rows:
            repo = dict(row)
            repo["topics"] = json.loads(repo["topics"]) if repo.get("topics") else []
            # Convert distance to similarity score (lower distance = higher score)
            distance = repo.pop("distance", 0)
            repo["score"] = 1.0 / (1.0 + distance)
            results.append(repo)

        return results
