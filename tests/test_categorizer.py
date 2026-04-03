"""Tests for starz.services.categorizer."""

import json
import os
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from starz.services.categorizer import (
    CATEGORIES,
    SYSTEM_PROMPT,
    _build_repo_description,
    categorize_batch,
    categorize_repos,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_repo(**overrides: object) -> dict:
    """Build a minimal valid repo dict with optional overrides."""
    base = {
        "id": 1,
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


def _mock_anthropic_response(results: list[dict]) -> MagicMock:
    """Build a mock Anthropic message response containing JSON results."""
    content_block = MagicMock()
    content_block.text = json.dumps(results)
    message = MagicMock()
    message.content = [content_block]
    return message


# ---------------------------------------------------------------------------
# CATEGORIES constant
# ---------------------------------------------------------------------------


class TestCategories:
    """Tests for the CATEGORIES constant."""

    def test_categories_is_nonempty_list(self) -> None:
        assert isinstance(CATEGORIES, list)
        assert len(CATEGORIES) > 0

    def test_categories_contains_other(self) -> None:
        """'Other' must be a valid fallback category."""
        assert "Other" in CATEGORIES

    def test_categories_are_unique(self) -> None:
        assert len(CATEGORIES) == len(set(CATEGORIES))


# ---------------------------------------------------------------------------
# _build_repo_description
# ---------------------------------------------------------------------------


class TestBuildRepoDescription:
    """Tests for _build_repo_description."""

    def test_full_name_always_present(self) -> None:
        desc = _build_repo_description({"full_name": "a/b"})
        assert "a/b" in desc

    def test_includes_description(self) -> None:
        desc = _build_repo_description(
            {"full_name": "a/b", "description": "A cool project"}
        )
        assert "A cool project" in desc

    def test_includes_language(self) -> None:
        desc = _build_repo_description({"full_name": "a/b", "language": "Rust"})
        assert "Rust" in desc

    def test_includes_topics_list(self) -> None:
        desc = _build_repo_description({"full_name": "a/b", "topics": ["web", "api"]})
        assert "web" in desc
        assert "api" in desc

    def test_topics_from_json_string(self) -> None:
        desc = _build_repo_description({"full_name": "a/b", "topics": '["web", "api"]'})
        assert "web" in desc
        assert "api" in desc

    def test_empty_topics_omitted(self) -> None:
        desc = _build_repo_description({"full_name": "a/b", "topics": []})
        assert "Topics" not in desc

    def test_missing_optional_fields(self) -> None:
        """Only full_name is required; missing fields should not crash."""
        desc = _build_repo_description({"full_name": "a/b"})
        assert isinstance(desc, str)
        assert "a/b" in desc

    def test_topics_truncated_at_ten(self) -> None:
        topics = [f"topic{i}" for i in range(15)]
        desc = _build_repo_description({"full_name": "a/b", "topics": topics})
        assert "topic9" in desc
        assert "topic10" not in desc


# ---------------------------------------------------------------------------
# categorize_batch
# ---------------------------------------------------------------------------


class TestCategorizeBatch:
    """Tests for categorize_batch."""

    def test_sends_correct_model(self) -> None:
        """Should use Claude Haiku model."""
        client = MagicMock()
        client.messages.create.return_value = _mock_anthropic_response(
            [{"full_name": "a/b", "category": "CLI Tool", "summary": "A CLI."}]
        )

        categorize_batch(client, [_make_repo(full_name="a/b")])

        call_kwargs = client.messages.create.call_args[1]
        assert "haiku" in call_kwargs["model"]

    def test_returns_parsed_results(self) -> None:
        """Should parse the JSON response into a list of dicts."""
        expected = [
            {"full_name": "a/b", "category": "CLI Tool", "summary": "A CLI tool."},
        ]
        client = MagicMock()
        client.messages.create.return_value = _mock_anthropic_response(expected)

        result = categorize_batch(client, [_make_repo(full_name="a/b")])
        assert result == expected

    def test_handles_markdown_code_block(self) -> None:
        """Claude sometimes wraps JSON in ```json blocks."""
        expected = [
            {"full_name": "a/b", "category": "Other", "summary": "Stuff."},
        ]
        content_block = MagicMock()
        content_block.text = f"```json\n{json.dumps(expected)}\n```"
        message = MagicMock()
        message.content = [content_block]

        client = MagicMock()
        client.messages.create.return_value = message

        result = categorize_batch(client, [_make_repo(full_name="a/b")])
        assert result == expected

    def test_system_prompt_includes_categories(self) -> None:
        """SYSTEM_PROMPT should mention all available categories."""
        for cat in CATEGORIES:
            assert cat in SYSTEM_PROMPT

    def test_batch_descriptions_numbered(self) -> None:
        """Each repo in the user message should be numbered."""
        client = MagicMock()
        client.messages.create.return_value = _mock_anthropic_response(
            [
                {"full_name": "a/one", "category": "Other", "summary": "x"},
                {"full_name": "b/two", "category": "Other", "summary": "y"},
            ]
        )

        categorize_batch(
            client,
            [_make_repo(full_name="a/one"), _make_repo(full_name="b/two")],
        )

        user_msg = client.messages.create.call_args[1]["messages"][0]["content"]
        assert "1. " in user_msg
        assert "2. " in user_msg


# ---------------------------------------------------------------------------
# categorize_repos (integration with DB, mocked Anthropic)
# ---------------------------------------------------------------------------


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
        from starz.db.client import _init_db

        _init_db(conn)

    yield conn
    conn.close()


def _insert_repo(conn: sqlite3.Connection, full_name: str, **kwargs: object) -> None:
    """Insert a repo directly for test setup."""
    from starz.db.client import upsert_repo

    repo = _make_repo(
        full_name=full_name, name=full_name.split("/")[1], owner=full_name.split("/")[0]
    )
    repo.update(kwargs)
    upsert_repo(conn, repo)
    conn.commit()


class TestCategorizeRepos:
    """Integration tests for categorize_repos with mocked Anthropic client."""

    def test_no_uncategorized_repos_returns_zero(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """When all repos already have a category, return 0."""
        _insert_repo(db_conn, "a/one")
        db_conn.execute(
            "UPDATE repos SET category = 'CLI Tool' WHERE full_name = 'a/one'"
        )
        db_conn.commit()

        mock_client = MagicMock()

        with (
            patch("starz.services.categorizer.get_db") as mock_get_db,
            patch("starz.services.categorizer._get_client", return_value=mock_client),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

            count = categorize_repos()

        assert count == 0
        mock_client.messages.create.assert_not_called()

    def test_categorizes_uncategorized_repos(self, db_conn: sqlite3.Connection) -> None:
        """Uncategorized repos should be updated with category and summary."""
        _insert_repo(
            db_conn,
            "vercel/next.js",
            description="React framework",
            language="JavaScript",
        )
        _insert_repo(
            db_conn,
            "pallets/flask",
            description="Python micro framework",
            language="Python",
        )

        api_response = [
            {
                "full_name": "vercel/next.js",
                "category": "Frontend Framework",
                "summary": "A React framework for production.",
            },
            {
                "full_name": "pallets/flask",
                "category": "Backend Framework",
                "summary": "A lightweight Python web framework.",
            },
        ]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_anthropic_response(
            api_response
        )

        with (
            patch("starz.services.categorizer.get_db") as mock_get_db,
            patch("starz.services.categorizer._get_client", return_value=mock_client),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

            count = categorize_repos()

        assert count == 2

        row1 = db_conn.execute(
            "SELECT category, summary FROM repos WHERE full_name = 'vercel/next.js'"
        ).fetchone()
        assert row1["category"] == "Frontend Framework"
        assert "React" in row1["summary"]

        row2 = db_conn.execute(
            "SELECT category, summary FROM repos WHERE full_name = 'pallets/flask'"
        ).fetchone()
        assert row2["category"] == "Backend Framework"

    def test_invalid_category_falls_back_to_other(
        self, db_conn: sqlite3.Connection
    ) -> None:
        """If Claude returns an unrecognized category, it should be replaced with 'Other'."""
        _insert_repo(db_conn, "a/b")

        api_response = [
            {
                "full_name": "a/b",
                "category": "INVALID_CATEGORY",
                "summary": "Some summary.",
            },
        ]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_anthropic_response(
            api_response
        )

        with (
            patch("starz.services.categorizer.get_db") as mock_get_db,
            patch("starz.services.categorizer._get_client", return_value=mock_client),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

            count = categorize_repos()

        assert count == 1
        row = db_conn.execute(
            "SELECT category FROM repos WHERE full_name = 'a/b'"
        ).fetchone()
        assert row["category"] == "Other"

    def test_api_error_continues_gracefully(self, db_conn: sqlite3.Connection) -> None:
        """If the API call fails for a batch, it should log and continue."""
        _insert_repo(db_conn, "a/b")

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = RuntimeError("API down")

        with (
            patch("starz.services.categorizer.get_db") as mock_get_db,
            patch("starz.services.categorizer._get_client", return_value=mock_client),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

            count = categorize_repos()

        assert count == 0

    def test_on_progress_callback(self, db_conn: sqlite3.Connection) -> None:
        """The on_progress callback should be invoked per batch."""
        _insert_repo(db_conn, "a/b")

        api_response = [
            {"full_name": "a/b", "category": "CLI Tool", "summary": "A CLI."},
        ]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _mock_anthropic_response(
            api_response
        )

        progress_calls = []

        with (
            patch("starz.services.categorizer.get_db") as mock_get_db,
            patch("starz.services.categorizer._get_client", return_value=mock_client),
        ):
            mock_get_db.return_value.__enter__ = lambda s: db_conn
            mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

            categorize_repos(on_progress=lambda *args: progress_calls.append(args))

        assert len(progress_calls) == 1
        assert progress_calls[0][0] == "categorizing"
