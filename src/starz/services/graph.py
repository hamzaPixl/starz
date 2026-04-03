"""Graph service: compute and query repo relationship edges."""

import json
import logging

from starz.db.client import get_db

logger = logging.getLogger(__name__)


def compute_similarity_edges(k: int = 5, threshold: float = 0.5) -> int:
    """Compute embedding similarity edges between repos."""
    count = 0
    with get_db() as conn:
        # Get all repos with embeddings
        repos = conn.execute("""
            SELECT r.id, e.embedding
            FROM repos r
            INNER JOIN repo_embeddings e ON r.id = e.repo_id
        """).fetchall()

        if not repos:
            return 0

        # Clear old similarity edges
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'similar'")

        for repo in repos:
            repo_id = repo["id"]
            embedding_bytes = repo["embedding"]

            # KNN query
            try:
                neighbors = conn.execute(
                    """
                    SELECT e.repo_id, e.distance
                    FROM repo_embeddings e
                    WHERE e.embedding MATCH ?
                      AND k = ?
                """,
                    (embedding_bytes, k + 1),
                ).fetchall()  # +1 because it includes self
            except Exception as e:
                logger.debug(f"KNN failed for repo {repo_id}: {e}")
                continue

            for neighbor in neighbors:
                target_id = neighbor["repo_id"]
                distance = neighbor["distance"]

                if target_id == repo_id:
                    continue

                similarity = 1.0 / (1.0 + distance)
                if similarity < threshold:
                    continue

                try:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
                        VALUES (?, ?, 'similar', ?)
                    """,
                        (repo_id, target_id, round(similarity, 3)),
                    )
                    count += 1
                except Exception:
                    pass

    return count


def compute_owner_edges() -> int:
    """Create edges between repos by the same owner."""
    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'same_owner'")

        result = conn.execute("""
            INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
            SELECT a.id, b.id, 'same_owner', 0.8
            FROM repos a
            INNER JOIN repos b ON a.owner = b.owner AND a.id < b.id
        """)
        return result.rowcount or 0


def compute_topic_edges(threshold: float = 0.3) -> int:
    """Create edges between repos sharing topics (Jaccard similarity)."""
    count = 0
    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'shared_topic'")

        rows = conn.execute(
            "SELECT id, topics FROM repos WHERE topics IS NOT NULL AND topics != '[]'"
        ).fetchall()

        repo_topics: dict[int, set[str]] = {}
        for row in rows:
            topics = json.loads(row["topics"]) if row["topics"] else []
            if topics:
                repo_topics[row["id"]] = set(topics)

        ids = list(repo_topics.keys())
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a_topics = repo_topics[ids[i]]
                b_topics = repo_topics[ids[j]]
                intersection = a_topics & b_topics
                if not intersection:
                    continue
                union = a_topics | b_topics
                jaccard = len(intersection) / len(union)
                if jaccard >= threshold:
                    try:
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
                            VALUES (?, ?, 'shared_topic', ?)
                        """,
                            (ids[i], ids[j], round(jaccard, 3)),
                        )
                        count += 1
                    except Exception:
                        pass

    return count


def compute_all_edges() -> dict[str, int]:
    """Run all edge computations. Returns counts by type."""
    similar = compute_similarity_edges()
    owner = compute_owner_edges()
    topic = compute_topic_edges()
    return {
        "similar": similar,
        "owner": owner,
        "topic": topic,
        "total": similar + owner + topic,
    }


def get_graph_data(edge_types: list[str] | None = None) -> dict:
    """Get full graph data for visualization."""
    with get_db() as conn:
        # Nodes
        rows = conn.execute("""
            SELECT id, full_name, name, owner, description, language, category,
                   stargazers_count, html_url, topics
            FROM repos
        """).fetchall()

        nodes = []
        for r in rows:
            nodes.append(
                {
                    "id": r["id"],
                    "label": r["name"],
                    "full_name": r["full_name"],
                    "owner": r["owner"],
                    "category": r["category"],
                    "language": r["language"],
                    "stars": r["stargazers_count"],
                    "url": r["html_url"],
                    "description": r["description"],
                }
            )

        # Edges
        type_filter = ""
        params: list = []
        if edge_types:
            placeholders = ",".join("?" for _ in edge_types)
            type_filter = f"WHERE edge_type IN ({placeholders})"
            params = edge_types

        edges = conn.execute(
            f"""
            SELECT source_id, target_id, edge_type, weight
            FROM repo_edges
            {type_filter}
        """,
            params,
        ).fetchall()

        links = [
            {
                "source": e["source_id"],
                "target": e["target_id"],
                "type": e["edge_type"],
                "weight": e["weight"],
            }
            for e in edges
        ]

    return {"nodes": nodes, "links": links}


def get_similar_repos(repo_id: int, limit: int = 5) -> list[dict]:
    """Get similar repos from precomputed edges."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT r.*, e.weight as similarity
            FROM repo_edges e
            INNER JOIN repos r ON (
                CASE WHEN e.source_id = ? THEN e.target_id ELSE e.source_id END
            ) = r.id
            WHERE (e.source_id = ? OR e.target_id = ?)
              AND e.edge_type = 'similar'
            ORDER BY e.weight DESC
            LIMIT ?
        """,
            (repo_id, repo_id, repo_id, limit),
        ).fetchall()

        results = []
        for row in rows:
            repo = dict(row)
            repo["topics"] = json.loads(repo["topics"]) if repo.get("topics") else []
            results.append(repo)
        return results
