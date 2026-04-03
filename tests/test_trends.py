"""Tests for starz.services.trends — trending analysis."""

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


def _seed_repos(conn: sqlite3.Connection) -> None:
    """Seed a set of repos with varied starred_at dates, categories, and languages."""
    repos = [
        _make_repo(
            full_name="a/one",
            name="one",
            owner="a",
            language="Python",
            topics=["web", "api"],
            starred_at="2025-01-15T10:00:00Z",
        ),
        _make_repo(
            full_name="b/two",
            name="two",
            owner="b",
            language="TypeScript",
            topics=["web", "react"],
            starred_at="2025-02-10T10:00:00Z",
        ),
        _make_repo(
            full_name="c/three",
            name="three",
            owner="c",
            language="Rust",
            topics=["systems", "cli"],
            starred_at="2025-03-05T10:00:00Z",
        ),
        _make_repo(
            full_name="d/four",
            name="four",
            owner="d",
            language="Python",
            topics=["ml", "api"],
            starred_at="2025-10-01T10:00:00Z",
        ),
        _make_repo(
            full_name="e/five",
            name="five",
            owner="e",
            language="Python",
            topics=["ml", "data"],
            starred_at="2025-11-15T10:00:00Z",
        ),
        _make_repo(
            full_name="f/six",
            name="six",
            owner="f",
            language="Python",
            topics=["ml", "web"],
            starred_at="2025-12-20T10:00:00Z",
        ),
    ]
    for r in repos:
        upsert_repo(conn, r)
    conn.commit()

    # Set categories directly
    conn.execute(
        "UPDATE repos SET category = 'Web' WHERE full_name IN ('a/one', 'b/two')"
    )
    conn.execute("UPDATE repos SET category = 'Systems' WHERE full_name = 'c/three'")
    conn.execute(
        "UPDATE repos SET category = 'ML/AI' WHERE full_name IN ('d/four', 'e/five', 'f/six')"
    )
    conn.commit()


class TestComputeTrends:
    """Tests for compute_trends."""

    def test_empty_db_returns_empty_timeline(self, db_conn: sqlite3.Connection) -> None:
        """An empty database returns an empty timeline and no hot topics."""
        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        assert result["timeline"] == []
        assert result["hot_topics"] == []
        assert result["accelerating"] == []
        assert result["declining"] == []

    def test_timeline_has_monthly_entries(self, db_conn: sqlite3.Connection) -> None:
        """Timeline contains one entry per month with starred repos."""
        _seed_repos(db_conn)

        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        timeline = result["timeline"]
        months = [t["month"] for t in timeline]

        assert len(timeline) == 6
        assert "2025-01" in months
        assert "2025-12" in months

        # Each month should have a count
        for entry in timeline:
            assert entry["count"] >= 1

    def test_hot_topics_are_populated(self, db_conn: sqlite3.Connection) -> None:
        """Hot topics list contains the most common topics from recent months."""
        _seed_repos(db_conn)

        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        hot_topics = result["hot_topics"]
        assert len(hot_topics) > 0

        topic_names = [t["topic"] for t in hot_topics]
        # "ml" appears 3 times in recent months, should be hot
        assert "ml" in topic_names

    def test_monthly_categories_present(self, db_conn: sqlite3.Connection) -> None:
        """Monthly categories breakdown contains recent months."""
        _seed_repos(db_conn)

        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        monthly_cats = result["monthly_categories"]
        assert len(monthly_cats) > 0

    def test_recent_total_counts(self, db_conn: sqlite3.Connection) -> None:
        """total_recent reflects the count of repos in recent months."""
        _seed_repos(db_conn)

        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        # Last 3 months are 2025-10, 2025-11, 2025-12 with 1 repo each
        assert result["total_recent"] == 3
        # Previous 3 months are 2025-01, 2025-02, 2025-03
        assert result["total_previous"] == 3

    def test_result_structure(self, db_conn: sqlite3.Connection) -> None:
        """compute_trends returns all expected keys."""
        with patch("starz.services.trends.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.trends import compute_trends

            result = compute_trends()

        expected_keys = {
            "timeline",
            "monthly_categories",
            "accelerating",
            "declining",
            "hot_topics",
            "recent_months",
            "total_recent",
            "total_previous",
        }
        assert set(result.keys()) == expected_keys
