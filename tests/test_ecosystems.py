"""Tests for starz.services.ecosystems — ecosystem detection, gap analysis, and ecosystem edges."""

import json
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


def _seed_ecosystem_repos(conn: sqlite3.Connection) -> None:
    """Seed repos that form recognizable ecosystems."""
    repos = [
        # React Fullstack ecosystem: react + next.js + tailwind
        _make_repo(
            full_name="vercel/next.js",
            name="next.js",
            owner="vercel",
            topics=["react", "next.js", "ssr", "framework"],
            description="The React Framework for the Web",
            language="JavaScript",
        ),
        _make_repo(
            full_name="facebook/react",
            name="react",
            owner="facebook",
            topics=["react", "ui", "javascript"],
            description="A JavaScript library for building user interfaces",
            language="JavaScript",
        ),
        _make_repo(
            full_name="tailwindlabs/tailwindcss",
            name="tailwindcss",
            owner="tailwindlabs",
            topics=["tailwind", "css", "design"],
            description="A utility-first CSS framework",
            language="CSS",
        ),
        # Python AI/ML ecosystem: langchain + openai
        _make_repo(
            full_name="langchain-ai/langchain",
            name="langchain",
            owner="langchain-ai",
            topics=["langchain", "llm", "ai"],
            description="Building applications with LLMs through composability",
            language="Python",
        ),
        _make_repo(
            full_name="openai/openai-python",
            name="openai-python",
            owner="openai",
            topics=["openai", "api", "python"],
            description="The official Python library for the OpenAI API",
            language="Python",
        ),
        # Python Web ecosystem: fastapi + pydantic
        _make_repo(
            full_name="tiangolo/fastapi",
            name="fastapi",
            owner="tiangolo",
            topics=["fastapi", "python", "api"],
            description="FastAPI framework, high performance, easy to learn",
            language="Python",
        ),
        _make_repo(
            full_name="pydantic/pydantic",
            name="pydantic",
            owner="pydantic",
            topics=["pydantic", "validation", "python"],
            description="Data validation using Python type annotations",
            language="Python",
        ),
        # Single repo that doesn't form an ecosystem on its own
        _make_repo(
            full_name="lone/wolf",
            name="wolf",
            owner="lone",
            topics=["random"],
            description="A standalone tool",
            language="Go",
        ),
    ]
    for r in repos:
        upsert_repo(conn, r)
    conn.commit()


class TestRepoMatchesComponent:
    """Tests for _repo_matches_component helper."""

    def test_matches_topic(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {
            "topics": json.dumps(["react", "next.js"]),
            "name": "myapp",
            "description": "An app",
        }
        assert (
            _repo_matches_component(repo, "react", ["topics", "name", "description"])
            is True
        )

    def test_matches_name(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {"topics": json.dumps([]), "name": "react-app", "description": "An app"}
        assert (
            _repo_matches_component(repo, "react", ["topics", "name", "description"])
            is True
        )

    def test_matches_description(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {
            "topics": json.dumps([]),
            "name": "myapp",
            "description": "A React application",
        }
        assert (
            _repo_matches_component(repo, "react", ["topics", "name", "description"])
            is True
        )

    def test_matches_language_field(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {
            "topics": json.dumps([]),
            "name": "myapp",
            "description": "A tool",
            "language": "Swift",
        }
        assert _repo_matches_component(repo, "swift", ["language"]) is True

    def test_no_match(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {
            "topics": json.dumps(["python"]),
            "name": "mylib",
            "description": "A library",
        }
        assert (
            _repo_matches_component(repo, "react", ["topics", "name", "description"])
            is False
        )

    def test_handles_none_fields(self) -> None:
        from starz.services.ecosystems import _repo_matches_component

        repo = {"topics": None, "name": None, "description": None}
        assert (
            _repo_matches_component(repo, "react", ["topics", "name", "description"])
            is False
        )


class TestDetectEcosystems:
    """Tests for detect_ecosystems."""

    def test_empty_db_returns_empty(self, db_conn: sqlite3.Connection) -> None:
        """An empty database returns no ecosystems."""
        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        assert result == {}

    def test_detects_react_fullstack(self, db_conn: sqlite3.Connection) -> None:
        """Detects React Fullstack ecosystem when enough components match."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        assert "React Fullstack" in result
        eco = result["React Fullstack"]
        assert eco["coverage"] > 0
        assert eco["repo_count"] >= 2
        assert len(eco["matched_components"]) >= 2

    def test_detects_python_ai_ml(self, db_conn: sqlite3.Connection) -> None:
        """Detects Python AI/ML ecosystem."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        assert "Python AI/ML" in result
        eco = result["Python AI/ML"]
        assert "langchain" in eco["matched_components"]
        assert "openai" in eco["matched_components"]

    def test_detects_python_web(self, db_conn: sqlite3.Connection) -> None:
        """Detects Python Web ecosystem."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        assert "Python Web" in result
        eco = result["Python Web"]
        assert "fastapi" in eco["matched_components"]
        assert "pydantic" in eco["matched_components"]

    def test_result_structure(self, db_conn: sqlite3.Connection) -> None:
        """Each detected ecosystem has the expected keys."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        for eco_name, eco_data in result.items():
            assert "coverage" in eco_data
            assert "matched_components" in eco_data
            assert "missing_components" in eco_data
            assert "repos" in eco_data
            assert "repo_count" in eco_data
            assert isinstance(eco_data["coverage"], float)
            assert isinstance(eco_data["matched_components"], list)
            assert isinstance(eco_data["missing_components"], list)
            assert isinstance(eco_data["repos"], list)
            assert isinstance(eco_data["repo_count"], int)

    def test_coverage_percentage_range(self, db_conn: sqlite3.Connection) -> None:
        """Coverage percentage is between 0 and 100."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems

            result = detect_ecosystems()

        for eco_data in result.values():
            assert 0 < eco_data["coverage"] <= 100

    def test_missing_components_complement_matched(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Missing + matched components equals all components in the ecosystem definition."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_ecosystems, ECOSYSTEMS

            result = detect_ecosystems()

        for eco_name, eco_data in result.items():
            all_components = set(ECOSYSTEMS[eco_name]["components"])
            matched_plus_missing = set(eco_data["matched_components"]) | set(
                eco_data["missing_components"]
            )
            assert matched_plus_missing == all_components


class TestDetectGaps:
    """Tests for detect_gaps."""

    def test_empty_db_returns_no_gaps(self, db_conn: sqlite3.Connection) -> None:
        """An empty database returns no gaps."""
        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_gaps

            result = detect_gaps()

        assert result == []

    def test_gaps_found_for_partial_ecosystems(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Gaps are identified for ecosystems with partial coverage."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_gaps

            result = detect_gaps()

        assert len(result) > 0

    def test_gap_structure(self, db_conn: sqlite3.Connection) -> None:
        """Each gap has the expected keys."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_gaps

            result = detect_gaps()

        for gap in result:
            assert "ecosystem" in gap
            assert "missing" in gap
            assert "coverage" in gap
            assert "suggestion" in gap

    def test_gaps_sorted_by_coverage_desc(self, db_conn: sqlite3.Connection) -> None:
        """Gaps are sorted by coverage descending (most-covered ecosystems first)."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import detect_gaps

            result = detect_gaps()

        if len(result) >= 2:
            coverages = [g["coverage"] for g in result]
            assert coverages == sorted(coverages, reverse=True)


class TestComputeEcosystemEdges:
    """Tests for compute_ecosystem_edges."""

    def test_empty_db_returns_zero(self, db_conn: sqlite3.Connection) -> None:
        """An empty database produces no ecosystem edges."""
        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import compute_ecosystem_edges

            count = compute_ecosystem_edges()

        assert count == 0

    def test_creates_edges_for_ecosystem_repos(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """Repos in the same ecosystem get edges created between them."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import compute_ecosystem_edges

            count = compute_ecosystem_edges()

        assert count > 0

        # Verify edges exist in the database
        edge_count = db_conn.execute(
            "SELECT COUNT(*) FROM repo_edges WHERE edge_type = 'ecosystem'"
        ).fetchone()[0]
        assert edge_count > 0

    def test_edges_have_correct_weight(self, db_conn: sqlite3.Connection) -> None:
        """Ecosystem edges have weight 0.7."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import compute_ecosystem_edges

            compute_ecosystem_edges()

        weights = db_conn.execute(
            "SELECT DISTINCT weight FROM repo_edges WHERE edge_type = 'ecosystem'"
        ).fetchall()
        assert all(w[0] == 0.7 for w in weights)

    def test_recompute_clears_old_edges(self, db_conn: sqlite3.Connection) -> None:
        """Running compute_ecosystem_edges twice doesn't double the edges."""
        _seed_ecosystem_repos(db_conn)

        with patch("starz.services.ecosystems.get_db") as mock_get_db:
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = lambda s, *a: None

            from starz.services.ecosystems import compute_ecosystem_edges

            compute_ecosystem_edges()
            count1 = db_conn.execute(
                "SELECT COUNT(*) FROM repo_edges WHERE edge_type = 'ecosystem'"
            ).fetchone()[0]

            compute_ecosystem_edges()
            count2 = db_conn.execute(
                "SELECT COUNT(*) FROM repo_edges WHERE edge_type = 'ecosystem'"
            ).fetchone()[0]

        assert count1 == count2


class TestEcosystemConstants:
    """Tests for the ECOSYSTEMS and TECH_PAIRS constants."""

    def test_at_least_10_ecosystems(self) -> None:
        """At least 10 ecosystems are defined."""
        from starz.services.ecosystems import ECOSYSTEMS

        assert len(ECOSYSTEMS) >= 10

    def test_each_ecosystem_has_required_keys(self) -> None:
        """Each ecosystem has components, match_fields, and min_match."""
        from starz.services.ecosystems import ECOSYSTEMS

        for name, eco in ECOSYSTEMS.items():
            assert "components" in eco, f"{name} missing 'components'"
            assert "match_fields" in eco, f"{name} missing 'match_fields'"
            assert "min_match" in eco, f"{name} missing 'min_match'"
            assert len(eco["components"]) >= 2, f"{name} needs at least 2 components"
            assert eco["min_match"] >= 2, f"{name} min_match should be >= 2"

    def test_at_least_30_tech_pairs(self) -> None:
        """At least 30 technology pairs are defined."""
        from starz.services.ecosystems import TECH_PAIRS

        assert len(TECH_PAIRS) >= 30
