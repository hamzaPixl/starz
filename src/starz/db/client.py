"""SQLite + sqlite-vec database layer for starz."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import sqlite_vec

from starz.config import settings

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def _init_db(conn: sqlite3.Connection) -> None:
    """Initialize database schema and extensions."""
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)

    # Create regular tables
    conn.executescript(SCHEMA_PATH.read_text())

    # Create vec0 virtual table (must be after extension load)
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS repo_embeddings USING vec0(
            repo_id INTEGER PRIMARY KEY,
            embedding FLOAT[1536]
        )
    """
    )

    # Repo edges table for graph relationships
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repo_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            edge_type TEXT NOT NULL,
            weight REAL DEFAULT 1.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(source_id, target_id, edge_type)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_edges_source ON repo_edges(source_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_edges_target ON repo_edges(target_id)")

    # Migrations (idempotent)
    migrations = [
        "ALTER TABLE repos ADD COLUMN license TEXT",
        "ALTER TABLE repos ADD COLUMN forks_count INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN open_issues_count INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN created_at_gh TEXT",
        "ALTER TABLE repos ADD COLUMN archived INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN size_kb INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN pushed_at TEXT",
        "ALTER TABLE repos ADD COLUMN watchers_count INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN is_fork INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN owner_type TEXT",
        "ALTER TABLE repos ADD COLUMN default_branch TEXT",
        "ALTER TABLE repos ADD COLUMN has_wiki INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN has_pages INTEGER DEFAULT 0",
        "ALTER TABLE repos ADD COLUMN health_score INTEGER DEFAULT 0",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except Exception:
            pass  # Column already exists

    # FTS5 full-text search table
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS repos_fts USING fts5(
            full_name, name, description, readme_content,
            content='repos', content_rowid='id',
            tokenize='porter unicode61'
        )
    """)


def rebuild_fts(conn: sqlite3.Connection) -> None:
    """Rebuild the FTS5 index from the repos table."""
    conn.execute("INSERT INTO repos_fts(repos_fts) VALUES('rebuild')")


def get_connection() -> sqlite3.Connection:
    """Get a new database connection with sqlite-vec loaded."""
    conn = sqlite3.connect(str(settings.db_path))
    conn.row_factory = sqlite3.Row
    _init_db(conn)
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def upsert_repo(conn: sqlite3.Connection, repo: dict) -> int:
    """Insert or update a repo. Returns the repo id."""
    now = datetime.now(timezone.utc).isoformat()
    topics_json = json.dumps(repo.get("topics", []))

    conn.execute(
        """
        INSERT INTO repos (full_name, name, owner, description, language, topics,
                          stargazers_count, html_url, homepage, updated_at, starred_at,
                          readme_content, synced_at,
                          license, forks_count, open_issues_count,
                          created_at_gh, archived, size_kb,
                          pushed_at, watchers_count, is_fork, owner_type,
                          default_branch, has_wiki, has_pages)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(full_name) DO UPDATE SET
            description = excluded.description,
            language = excluded.language,
            topics = excluded.topics,
            stargazers_count = excluded.stargazers_count,
            html_url = excluded.html_url,
            homepage = excluded.homepage,
            updated_at = excluded.updated_at,
            readme_content = COALESCE(excluded.readme_content, repos.readme_content),
            synced_at = excluded.synced_at,
            license = excluded.license,
            forks_count = excluded.forks_count,
            open_issues_count = excluded.open_issues_count,
            created_at_gh = excluded.created_at_gh,
            archived = excluded.archived,
            size_kb = excluded.size_kb,
            pushed_at = excluded.pushed_at,
            watchers_count = excluded.watchers_count,
            is_fork = excluded.is_fork,
            owner_type = excluded.owner_type,
            default_branch = excluded.default_branch,
            has_wiki = excluded.has_wiki,
            has_pages = excluded.has_pages
    """,
        (
            repo["full_name"],
            repo["name"],
            repo["owner"],
            repo.get("description"),
            repo.get("language"),
            topics_json,
            repo.get("stargazers_count", 0),
            repo["html_url"],
            repo.get("homepage"),
            repo.get("updated_at"),
            repo.get("starred_at"),
            repo.get("readme_content"),
            now,
            repo.get("license"),
            repo.get("forks_count", 0),
            repo.get("open_issues_count", 0),
            repo.get("created_at_gh"),
            repo.get("archived", 0),
            repo.get("size_kb", 0),
            repo.get("pushed_at"),
            repo.get("watchers_count", 0),
            repo.get("is_fork", 0),
            repo.get("owner_type", "User"),
            repo.get("default_branch"),
            repo.get("has_wiki", 0),
            repo.get("has_pages", 0),
        ),
    )

    cursor = conn.execute(
        "SELECT id FROM repos WHERE full_name = ?", (repo["full_name"],)
    )
    return cursor.fetchone()["id"]


def get_repos(
    conn: sqlite3.Connection,
    category: str | None = None,
    language: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Get repos with optional filters. Returns (repos, total_count)."""
    conditions = []
    params: list = []

    if category:
        conditions.append("category = ?")
        params.append(category)
    if language:
        conditions.append("language = ?")
        params.append(language)
    if q:
        conditions.append("(name LIKE ? OR description LIKE ? OR full_name LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Count
    count_row = conn.execute(
        f"SELECT COUNT(*) as cnt FROM repos {where}", params
    ).fetchone()
    total = count_row["cnt"]

    # Fetch
    rows = conn.execute(
        f"SELECT * FROM repos {where} ORDER BY starred_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    repos = []
    for row in rows:
        repo = dict(row)
        # Parse topics JSON back to list
        repo["topics"] = json.loads(repo["topics"]) if repo["topics"] else []
        repos.append(repo)

    return repos, total


def get_repo_by_id(conn: sqlite3.Connection, repo_id: int) -> dict | None:
    """Get a single repo by ID."""
    row = conn.execute("SELECT * FROM repos WHERE id = ?", (repo_id,)).fetchone()
    if row is None:
        return None
    repo = dict(row)
    repo["topics"] = json.loads(repo["topics"]) if repo["topics"] else []
    return repo


def get_stats(conn: sqlite3.Connection) -> dict:
    """Get aggregate stats."""
    total = conn.execute("SELECT COUNT(*) as cnt FROM repos").fetchone()["cnt"]

    cat_rows = conn.execute(
        "SELECT category, COUNT(*) as cnt FROM repos "
        "WHERE category IS NOT NULL GROUP BY category ORDER BY cnt DESC"
    ).fetchall()
    by_category = {row["category"]: row["cnt"] for row in cat_rows}

    lang_rows = conn.execute(
        "SELECT language, COUNT(*) as cnt FROM repos "
        "WHERE language IS NOT NULL GROUP BY language ORDER BY cnt DESC"
    ).fetchall()
    by_language = {row["language"]: row["cnt"] for row in lang_rows}

    return {"total": total, "by_category": by_category, "by_language": by_language}
