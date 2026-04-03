"""Tests for starz.services.export — awesome list generation."""

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


def _seed_repos_for_export(conn: sqlite3.Connection) -> None:
    """Seed repos with categories, languages, and health scores for export tests."""
    repos = [
        _make_repo(
            full_name="fastapi/fastapi",
            name="fastapi",
            owner="fastapi",
            language="Python",
            description="Modern web framework for building APIs",
            stargazers_count=75000,
        ),
        _make_repo(
            full_name="rust-lang/rust",
            name="rust",
            owner="rust-lang",
            language="Rust",
            description="Empowering everyone to build reliable software",
            stargazers_count=95000,
        ),
        _make_repo(
            full_name="vercel/next.js",
            name="next.js",
            owner="vercel",
            language="TypeScript",
            description="The React Framework for Production",
            stargazers_count=120000,
        ),
        _make_repo(
            full_name="tokio-rs/tokio",
            name="tokio",
            owner="tokio-rs",
            language="Rust",
            description="An async runtime for Rust",
            stargazers_count=25000,
        ),
    ]
    for r in repos:
        upsert_repo(conn, r)
    conn.commit()

    conn.execute(
        "UPDATE repos SET category = 'Web', health_score = 85 WHERE full_name = 'fastapi/fastapi'"
    )
    conn.execute(
        "UPDATE repos SET category = 'Systems', health_score = 95 WHERE full_name = 'rust-lang/rust'"
    )
    conn.execute(
        "UPDATE repos SET category = 'Web', health_score = 90 WHERE full_name = 'vercel/next.js'"
    )
    conn.execute(
        "UPDATE repos SET category = 'Systems', health_score = 80 WHERE full_name = 'tokio-rs/tokio'"
    )
    conn.commit()


class TestGenerateAwesomeList:
    """Tests for generate_awesome_list."""

    def test_empty_db_returns_header(self, db_conn: sqlite3.Connection) -> None:
        """An empty database still produces a valid markdown header."""
        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert md.startswith("# My Starred Repos")
        assert "0 GitHub stars" in md

    def test_contains_repo_entries(self, db_conn: sqlite3.Connection) -> None:
        """Generated markdown contains links to each repo."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert "fastapi/fastapi" in md
        assert "rust-lang/rust" in md
        assert "vercel/next.js" in md
        assert "tokio-rs/tokio" in md

    def test_grouped_by_category(self, db_conn: sqlite3.Connection) -> None:
        """Repos are grouped under category headings."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert "## Web" in md
        assert "## Systems" in md

    def test_toc_present(self, db_conn: sqlite3.Connection) -> None:
        """Table of contents links are present."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert "## Table of Contents" in md
        assert "- [Web](#web)" in md
        assert "- [Systems](#systems)" in md

    def test_star_count_formatting(self, db_conn: sqlite3.Connection) -> None:
        """Star counts over 1000 are formatted as Xk."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        # 120000 -> 120.0k
        assert "120.0k" in md
        # 75000 -> 75.0k
        assert "75.0k" in md

    def test_language_tag_present(self, db_conn: sqlite3.Connection) -> None:
        """Language is shown as inline code after the repo link."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert "`Python`" in md
        assert "`Rust`" in md
        assert "`TypeScript`" in md

    def test_description_truncation(self, db_conn: sqlite3.Connection) -> None:
        """Descriptions longer than 120 chars are truncated with ellipsis."""
        long_desc = "A" * 200
        upsert_repo(
            db_conn,
            _make_repo(
                full_name="x/long",
                name="long",
                owner="x",
                description=long_desc,
                stargazers_count=10,
            ),
        )
        db_conn.commit()
        db_conn.execute(
            "UPDATE repos SET category = 'Other', health_score = 50 WHERE full_name = 'x/long'"
        )
        db_conn.commit()

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        # The long description should be truncated
        assert "A" * 117 + "..." in md
        assert "A" * 118 not in md

    def test_health_score_present(self, db_conn: sqlite3.Connection) -> None:
        """Health score is shown for each repo entry."""
        _seed_repos_for_export(db_conn)

        with patch("starz.services.export.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.export import generate_awesome_list

            md = generate_awesome_list()

        assert "health:85" in md
        assert "health:95" in md
