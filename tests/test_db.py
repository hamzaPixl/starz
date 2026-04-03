"""Tests for starz.db database layer."""

import os
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from starz.db.client import (
    _init_db,
    get_repos,
    get_repo_by_id,
    get_stats,
    upsert_repo,
)


@pytest.fixture()
def db_conn(tmp_path: Path) -> sqlite3.Connection:
    """Create an in-memory-like temp database with schema initialized."""
    db_file = tmp_path / "test.db"

    env = {
        k: v
        for k, v in os.environ.items()
        if k
        not in (
            "STARZ_DATA_DIR",
            "GITHUB_TOKEN",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
        )
    }
    env["STARZ_DATA_DIR"] = str(tmp_path)

    with patch.dict(os.environ, env, clear=True):
        from starz.config import Settings

        settings = Settings()

    conn = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row

    with patch("starz.db.client.settings", settings):
        _init_db(conn)

    yield conn
    conn.close()


def _make_repo(**overrides: object) -> dict:
    """Build a minimal valid repo dict with optional overrides."""
    base = {
        "full_name": "owner/repo",
        "name": "repo",
        "owner": "owner",
        "html_url": "https://github.com/owner/repo",
        "topics": ["python", "cli"],
        "description": "A test repo",
        "language": "Python",
        "stargazers_count": 42,
    }
    base.update(overrides)
    return base


class TestUpsertRepo:
    """Tests for upsert_repo."""

    def test_insert_returns_id(self, db_conn: sqlite3.Connection) -> None:
        """Inserting a new repo returns a positive integer id."""
        repo_id = upsert_repo(db_conn, _make_repo())
        db_conn.commit()
        assert isinstance(repo_id, int)
        assert repo_id > 0

    def test_upsert_updates_on_conflict(self, db_conn: sqlite3.Connection) -> None:
        """Upserting the same full_name updates fields instead of duplicating."""
        repo_id_1 = upsert_repo(db_conn, _make_repo(description="first"))
        db_conn.commit()
        repo_id_2 = upsert_repo(db_conn, _make_repo(description="second"))
        db_conn.commit()

        assert repo_id_1 == repo_id_2

        row = get_repo_by_id(db_conn, repo_id_1)
        assert row is not None
        assert row["description"] == "second"

    def test_upsert_preserves_readme_when_null(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Upserting with readme_content=None preserves the existing readme."""
        upsert_repo(db_conn, _make_repo(readme_content="# Hello"))
        db_conn.commit()
        upsert_repo(db_conn, _make_repo(readme_content=None))
        db_conn.commit()

        row = db_conn.execute(
            "SELECT readme_content FROM repos WHERE full_name = ?", ("owner/repo",)
        ).fetchone()
        assert row["readme_content"] == "# Hello"

    def test_topics_stored_as_json(self, db_conn: sqlite3.Connection) -> None:
        """Topics list is serialized as JSON in the database."""
        upsert_repo(db_conn, _make_repo(topics=["rust", "wasm"]))
        db_conn.commit()

        raw = db_conn.execute(
            "SELECT topics FROM repos WHERE full_name = ?", ("owner/repo",)
        ).fetchone()
        assert raw["topics"] == '["rust", "wasm"]'

    def test_synced_at_is_set(self, db_conn: sqlite3.Connection) -> None:
        """synced_at is automatically populated on insert."""
        repo_id = upsert_repo(db_conn, _make_repo())
        db_conn.commit()

        row = db_conn.execute(
            "SELECT synced_at FROM repos WHERE id = ?", (repo_id,)
        ).fetchone()
        assert row["synced_at"] is not None


class TestGetRepos:
    """Tests for get_repos."""

    def test_empty_db_returns_empty(self, db_conn: sqlite3.Connection) -> None:
        """An empty database returns an empty list and zero total."""
        repos, total = get_repos(db_conn)
        assert repos == []
        assert total == 0

    def test_returns_inserted_repos(self, db_conn: sqlite3.Connection) -> None:
        """Repos inserted via upsert are returned by get_repos."""
        upsert_repo(db_conn, _make_repo(full_name="a/one", name="one", owner="a"))
        upsert_repo(db_conn, _make_repo(full_name="b/two", name="two", owner="b"))
        db_conn.commit()

        repos, total = get_repos(db_conn)
        assert total == 2
        assert len(repos) == 2

    def test_filter_by_language(self, db_conn: sqlite3.Connection) -> None:
        """Filtering by language returns only matching repos."""
        upsert_repo(
            db_conn,
            _make_repo(full_name="a/py", name="py", owner="a", language="Python"),
        )
        upsert_repo(
            db_conn,
            _make_repo(full_name="b/rs", name="rs", owner="b", language="Rust"),
        )
        db_conn.commit()

        repos, total = get_repos(db_conn, language="Rust")
        assert total == 1
        assert repos[0]["language"] == "Rust"

    def test_filter_by_query(self, db_conn: sqlite3.Connection) -> None:
        """Text query filters on name, description, and full_name."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/fastapi", name="fastapi", owner="a", description="web"
            ),
        )
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="b/django", name="django", owner="b", description="web"
            ),
        )
        db_conn.commit()

        repos, total = get_repos(db_conn, q="fastapi")
        assert total == 1
        assert repos[0]["name"] == "fastapi"

    def test_pagination(self, db_conn: sqlite3.Connection) -> None:
        """Limit and offset control pagination."""
        for i in range(5):
            upsert_repo(
                db_conn,
                _make_repo(
                    full_name=f"o/r{i}",
                    name=f"r{i}",
                    owner="o",
                    starred_at=f"2024-01-0{i + 1}T00:00:00Z",
                ),
            )
        db_conn.commit()

        repos, total = get_repos(db_conn, limit=2, offset=0)
        assert total == 5
        assert len(repos) == 2

    def test_topics_deserialized(self, db_conn: sqlite3.Connection) -> None:
        """Topics are returned as a list, not a JSON string."""
        upsert_repo(db_conn, _make_repo(topics=["ai", "ml"]))
        db_conn.commit()

        repos, _ = get_repos(db_conn)
        assert repos[0]["topics"] == ["ai", "ml"]


class TestGetRepoById:
    """Tests for get_repo_by_id."""

    def test_returns_none_for_missing(self, db_conn: sqlite3.Connection) -> None:
        """Returns None when the repo doesn't exist."""
        assert get_repo_by_id(db_conn, 999) is None

    def test_returns_repo(self, db_conn: sqlite3.Connection) -> None:
        """Returns the correct repo by id."""
        repo_id = upsert_repo(db_conn, _make_repo())
        db_conn.commit()

        result = get_repo_by_id(db_conn, repo_id)
        assert result is not None
        assert result["full_name"] == "owner/repo"
        assert result["topics"] == ["python", "cli"]


class TestGetStats:
    """Tests for get_stats."""

    def test_empty_stats(self, db_conn: sqlite3.Connection) -> None:
        """Stats on an empty database return zero total and empty dicts."""
        stats = get_stats(db_conn)
        assert stats["total"] == 0
        assert stats["by_category"] == {}
        assert stats["by_language"] == {}

    def test_counts_by_language(self, db_conn: sqlite3.Connection) -> None:
        """Stats correctly count repos by language."""
        upsert_repo(
            db_conn,
            _make_repo(full_name="a/one", name="one", owner="a", language="Python"),
        )
        upsert_repo(
            db_conn,
            _make_repo(full_name="b/two", name="two", owner="b", language="Python"),
        )
        upsert_repo(
            db_conn,
            _make_repo(full_name="c/three", name="three", owner="c", language="Rust"),
        )
        db_conn.commit()

        stats = get_stats(db_conn)
        assert stats["total"] == 3
        assert stats["by_language"]["Python"] == 2
        assert stats["by_language"]["Rust"] == 1

    def test_counts_by_category(self, db_conn: sqlite3.Connection) -> None:
        """Stats correctly count repos by category."""
        upsert_repo(db_conn, _make_repo(full_name="a/one", name="one", owner="a"))
        db_conn.commit()
        # Set category directly since upsert doesn't handle it
        db_conn.execute(
            "UPDATE repos SET category = ? WHERE full_name = ?", ("tools", "a/one")
        )
        db_conn.commit()

        stats = get_stats(db_conn)
        assert stats["by_category"]["tools"] == 1


class TestSchemaAndExtension:
    """Tests for schema initialization and sqlite-vec extension."""

    def test_repos_table_exists(self, db_conn: sqlite3.Connection) -> None:
        """The repos table is created by _init_db."""
        row = db_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='repos'"
        ).fetchone()
        assert row is not None

    def test_repo_embeddings_table_exists(self, db_conn: sqlite3.Connection) -> None:
        """The repo_embeddings vec0 virtual table is created."""
        row = db_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='repo_embeddings'"
        ).fetchone()
        assert row is not None

    def test_indexes_created(self, db_conn: sqlite3.Connection) -> None:
        """Expected indexes are created on the repos table."""
        rows = db_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='repos'"
        ).fetchall()
        index_names = {row["name"] for row in rows}

        assert "idx_repos_category" in index_names
        assert "idx_repos_language" in index_names
        assert "idx_repos_starred_at" in index_names

    def test_sqlite_vec_loaded(self, db_conn: sqlite3.Connection) -> None:
        """sqlite-vec extension is loaded and functional."""
        row = db_conn.execute("SELECT vec_version()").fetchone()
        assert row[0] is not None
