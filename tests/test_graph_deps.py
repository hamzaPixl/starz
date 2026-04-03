"""Tests for dependency edge parsing in starz.services.graph."""

import os
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from starz.db.client import _init_db, upsert_repo


@pytest.fixture()
def db_conn(tmp_path: Path) -> sqlite3.Connection:
    """Create a temp database with schema initialized."""
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


class TestComputeDependencyEdges:
    """Tests for compute_dependency_edges."""

    def test_no_repos_returns_zero(self, db_conn: sqlite3.Connection) -> None:
        """An empty database produces zero dependency edges."""
        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 0

    def test_pip_install_creates_edge(self, db_conn: sqlite3.Connection) -> None:
        """A README with 'pip install <pkg>' creates a depends_on edge
        when <pkg> matches a starred repo name."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/fastapi",
                name="fastapi",
                owner="a",
                readme_content="# fastapi\nA web framework",
            ),
        )
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="b/myapp",
                name="myapp",
                owner="b",
                readme_content="# My App\n\npip install fastapi\n",
            ),
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 1

        edge = db_conn.execute(
            "SELECT * FROM repo_edges WHERE edge_type = 'depends_on'"
        ).fetchone()
        assert edge is not None
        assert edge["weight"] == 0.6

    def test_npm_install_creates_edge(self, db_conn: sqlite3.Connection) -> None:
        """A README with 'npm install <pkg>' creates a depends_on edge."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/lodash",
                name="lodash",
                owner="a",
                readme_content="# lodash\nUtility library",
            ),
        )
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="b/webapp",
                name="webapp",
                owner="b",
                readme_content="# Web App\n\nnpm install lodash\n",
            ),
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 1

    def test_no_self_edges(self, db_conn: sqlite3.Connection) -> None:
        """A repo mentioning itself does not create a self-edge."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/mylib",
                name="mylib",
                owner="a",
                readme_content="# mylib\npip install mylib\n",
            ),
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 0

    def test_no_readme_skipped(self, db_conn: sqlite3.Connection) -> None:
        """Repos with no readme_content are skipped."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/fastapi",
                name="fastapi",
                owner="a",
                readme_content=None,
            ),
        )
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="b/myapp",
                name="myapp",
                owner="b",
                readme_content=None,
            ),
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 0

    def test_multiple_patterns_deduplicate(self, db_conn: sqlite3.Connection) -> None:
        """Multiple pattern matches for the same target produce only one edge."""
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="a/click",
                name="click",
                owner="a",
                readme_content="# click",
            ),
        )
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="b/tool",
                name="tool",
                owner="b",
                readme_content="pip install click\nfrom click import command\nimport click",
            ),
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            count = compute_dependency_edges()

        assert count == 1

    def test_clears_old_depends_on_edges(self, db_conn: sqlite3.Connection) -> None:
        """Running compute_dependency_edges clears old depends_on edges first."""
        # Insert a stale edge
        db_conn.execute(
            "INSERT INTO repo_edges (source_id, target_id, edge_type, weight) VALUES (999, 998, 'depends_on', 0.6)"
        )
        db_conn.commit()

        with patch("starz.services.graph.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_dependency_edges

            compute_dependency_edges()

        stale = db_conn.execute(
            "SELECT * FROM repo_edges WHERE source_id = 999 AND edge_type = 'depends_on'"
        ).fetchone()
        assert stale is None


class TestComputeAllEdgesIncludesDeps:
    """Test that compute_all_edges includes depends_on edges."""

    def test_return_dict_has_depends_on_key(self, db_conn: sqlite3.Connection) -> None:
        """compute_all_edges returns a dict containing 'depends_on'."""
        with (
            patch("starz.services.graph.get_db") as mock_get_db,
            patch("starz.services.graph.compute_similarity_edges", return_value=0),
            patch("starz.services.graph.compute_owner_edges", return_value=0),
            patch("starz.services.graph.compute_topic_edges", return_value=0),
            patch("starz.services.graph.compute_temporal_edges", return_value=0),
            patch("starz.services.graph.compute_dependency_edges", return_value=5),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.graph import compute_all_edges

            result = compute_all_edges()

        assert "depends_on" in result
        assert result["depends_on"] == 5
        assert result["total"] == 5
