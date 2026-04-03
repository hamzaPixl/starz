"""Graph service: compute and query repo relationship edges."""

import json
import logging
from collections import Counter

from starz.db.client import get_db

logger = logging.getLogger(__name__)


def compute_similarity_edges(k: int = 5, threshold: float = 0.55) -> int:
    """Compute embedding similarity edges. Only keep meaningful connections."""
    count = 0
    with get_db() as conn:
        repos = conn.execute("""
            SELECT r.id, e.embedding
            FROM repos r
            INNER JOIN repo_embeddings e ON r.id = e.repo_id
        """).fetchall()

        if not repos:
            return 0

        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'similar'")

        for repo in repos:
            repo_id = repo["id"]
            embedding_bytes = repo["embedding"]

            try:
                neighbors = conn.execute(
                    """
                    SELECT e.repo_id, e.distance
                    FROM repo_embeddings e
                    WHERE e.embedding MATCH ?
                      AND k = ?
                """,
                    (embedding_bytes, k + 1),
                ).fetchall()
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


def compute_owner_edges(max_repos_per_owner: int = 8) -> int:
    """Create edges between repos by the same owner.
    Skip owners with too many repos (they create unreadable star patterns).
    """
    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'same_owner'")

        result = conn.execute(
            """
            INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
            SELECT a.id, b.id, 'same_owner', 0.8
            FROM repos a
            INNER JOIN repos b ON a.owner = b.owner AND a.id < b.id
            WHERE a.owner IN (
                SELECT owner FROM repos GROUP BY owner HAVING COUNT(*) BETWEEN 2 AND ?
            )
        """,
            (max_repos_per_owner,),
        )
        return result.rowcount or 0


def compute_topic_edges(min_shared: int = 2) -> int:
    """Create edges between repos sharing at least min_shared topics."""
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
                intersection = repo_topics[ids[i]] & repo_topics[ids[j]]
                if len(intersection) < min_shared:
                    continue
                union = repo_topics[ids[i]] | repo_topics[ids[j]]
                jaccard = len(intersection) / len(union)
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


def compute_temporal_edges(window_hours: int = 24) -> int:
    """Create edges between repos starred within the same time window."""
    count = 0
    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'temporal'")

        rows = conn.execute("""
            SELECT id, starred_at FROM repos
            WHERE starred_at IS NOT NULL
            ORDER BY starred_at
        """).fetchall()

        if len(rows) < 2:
            return 0

        from datetime import datetime, timedelta

        parsed = []
        for r in rows:
            try:
                dt = datetime.fromisoformat(r["starred_at"].replace("Z", "+00:00"))
                parsed.append((r["id"], dt))
            except Exception:
                continue

        window = timedelta(hours=window_hours)
        for i in range(len(parsed)):
            for j in range(i + 1, len(parsed)):
                diff = abs(parsed[j][1] - parsed[i][1])
                if diff > window:
                    break
                weight = round(1.0 - (diff.total_seconds() / window.total_seconds()), 3)
                if weight < 0.3:
                    continue
                try:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
                        VALUES (?, ?, 'temporal', ?)
                    """,
                        (parsed[i][0], parsed[j][0], weight),
                    )
                    count += 1
                except Exception:
                    pass

    return count


def compute_dependency_edges() -> int:
    """Parse README content for dependency mentions and cross-reference against starred repos."""
    import re

    count = 0
    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'depends_on'")

        repos = conn.execute(
            "SELECT id, full_name, name, readme_content FROM repos"
        ).fetchall()

        # Build name lookup: lowercase name -> repo id
        name_to_id: dict[str, int] = {}
        for r in repos:
            name_to_id[r["name"].lower()] = r["id"]
            name_to_id[r["full_name"].lower()] = r["id"]

        # Patterns that indicate dependency usage
        patterns = [
            r"npm\s+install\s+([a-z0-9@/_-]+)",
            r"yarn\s+add\s+([a-z0-9@/_-]+)",
            r"bun\s+add\s+([a-z0-9@/_-]+)",
            r"pip\s+install\s+([a-z0-9_-]+)",
            r"from\s+([a-z_]+)\s+import",
            r"import\s+([a-z_]+)",
            r'require\(["\']([a-z0-9@/_-]+)["\']\)',
        ]

        for repo in repos:
            readme = repo["readme_content"]
            if not readme:
                continue

            repo_id = repo["id"]
            mentioned: set[int] = set()

            for pattern in patterns:
                matches = re.findall(pattern, readme.lower())
                for match in matches:
                    # Clean up package name
                    pkg = match.strip().split("/")[-1]  # Get base name
                    if pkg in name_to_id and name_to_id[pkg] != repo_id:
                        mentioned.add(name_to_id[pkg])

            for target_id in mentioned:
                try:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
                        VALUES (?, ?, 'depends_on', 0.6)
                    """,
                        (repo_id, target_id),
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
    temporal = compute_temporal_edges()
    deps = compute_dependency_edges()
    total = similar + owner + topic + temporal + deps
    return {
        "similar": similar,
        "owner": owner,
        "topic": topic,
        "temporal": temporal,
        "depends_on": deps,
        "total": total,
    }


def get_graph_data(edge_types: list[str] | None = None) -> dict:
    """Get full graph data for visualization."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, full_name, name, owner, description, language, category,
                   stargazers_count, html_url, topics, license, forks_count,
                   starred_at, created_at_gh
            FROM repos
        """).fetchall()

        nodes = []
        for r in rows:
            topics = json.loads(r["topics"]) if r["topics"] else []
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
                    "topics": topics,
                    "license": r["license"],
                    "forks": r["forks_count"] or 0,
                    "starred_at": r["starred_at"],
                    "created_at": r["created_at_gh"],
                }
            )

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


def get_collection_stats() -> dict:
    """Rich analytics about the starred collection."""
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM repos").fetchone()[0]

        # Category breakdown
        cats = conn.execute(
            "SELECT category, COUNT(*) as cnt FROM repos WHERE category IS NOT NULL GROUP BY category ORDER BY cnt DESC"
        ).fetchall()
        by_category = {r["category"]: r["cnt"] for r in cats}

        # Language breakdown
        langs = conn.execute(
            "SELECT language, COUNT(*) as cnt FROM repos WHERE language IS NOT NULL GROUP BY language ORDER BY cnt DESC"
        ).fetchall()
        by_language = {r["language"]: r["cnt"] for r in langs}

        # Top owners
        owners = conn.execute(
            "SELECT owner, COUNT(*) as cnt FROM repos GROUP BY owner ORDER BY cnt DESC LIMIT 15"
        ).fetchall()
        top_owners = {r["owner"]: r["cnt"] for r in owners}

        # License breakdown
        licenses = conn.execute(
            "SELECT license, COUNT(*) as cnt FROM repos WHERE license IS NOT NULL GROUP BY license ORDER BY cnt DESC"
        ).fetchall()
        by_license = {r["license"]: r["cnt"] for r in licenses}

        # Star ranges
        star_ranges = {}
        for label, lo, hi in [
            ("0-100", 0, 100),
            ("100-1K", 100, 1000),
            ("1K-10K", 1000, 10000),
            ("10K-100K", 10000, 100000),
            ("100K+", 100000, 999999999),
        ]:
            cnt = conn.execute(
                "SELECT COUNT(*) FROM repos WHERE stargazers_count >= ? AND stargazers_count < ?",
                (lo, hi),
            ).fetchone()[0]
            star_ranges[label] = cnt

        # Top topics
        all_topics: list[str] = []
        rows = conn.execute(
            "SELECT topics FROM repos WHERE topics IS NOT NULL AND topics != '[]'"
        ).fetchall()
        for r in rows:
            all_topics.extend(json.loads(r["topics"]))
        topic_counts = dict(Counter(all_topics).most_common(25))

        # Top sub-tags
        all_sub_tags: list[str] = []
        sub_rows = conn.execute(
            "SELECT sub_tags FROM repos WHERE sub_tags IS NOT NULL"
        ).fetchall()
        for r in sub_rows:
            all_sub_tags.extend(json.loads(r["sub_tags"]))
        sub_tag_counts = dict(Counter(all_sub_tags).most_common(30))

        # Starring timeline (monthly)
        timeline_rows = conn.execute("""
            SELECT SUBSTR(starred_at, 1, 7) as month, COUNT(*) as cnt
            FROM repos WHERE starred_at IS NOT NULL
            GROUP BY month ORDER BY month
        """).fetchall()
        timeline = {r["month"]: r["cnt"] for r in timeline_rows}

        # Edge stats
        edge_rows = conn.execute(
            "SELECT edge_type, COUNT(*) as cnt, AVG(weight) as avg_w FROM repo_edges GROUP BY edge_type"
        ).fetchall()
        edges = {
            r["edge_type"]: {"count": r["cnt"], "avg_weight": round(r["avg_w"], 3)}
            for r in edge_rows
        }

        # Top starred repos
        top_repos = conn.execute(
            "SELECT full_name, stargazers_count, category, language FROM repos ORDER BY stargazers_count DESC LIMIT 10"
        ).fetchall()
        top_starred = [
            {
                "full_name": r["full_name"],
                "stars": r["stargazers_count"],
                "category": r["category"],
                "language": r["language"],
            }
            for r in top_repos
        ]

        # Recently starred
        recent = conn.execute(
            "SELECT full_name, starred_at, category, language FROM repos WHERE starred_at IS NOT NULL ORDER BY starred_at DESC LIMIT 10"
        ).fetchall()
        recently_starred = [
            {
                "full_name": r["full_name"],
                "starred_at": r["starred_at"],
                "category": r["category"],
                "language": r["language"],
            }
            for r in recent
        ]

    return {
        "total": total,
        "by_category": by_category,
        "by_language": by_language,
        "by_license": by_license,
        "top_owners": top_owners,
        "star_ranges": star_ranges,
        "top_topics": topic_counts,
        "top_sub_tags": sub_tag_counts,
        "timeline": timeline,
        "edges": edges,
        "top_starred": top_starred,
        "recently_starred": recently_starred,
    }
