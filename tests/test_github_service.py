"""Tests for starz.services.github — GitHub stars fetching + README extraction."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from starz.services.github import (
    _headers,
    fetch_readme,
    fetch_readmes,
    fetch_starred_repos,
    sync_from_github,
)


def _starred_item(full_name: str = "owner/repo", **overrides) -> dict:
    """Build a single starred-repo API response item."""
    owner, name = full_name.split("/", 1)
    base = {
        "starred_at": "2024-06-01T00:00:00Z",
        "repo": {
            "full_name": full_name,
            "name": name,
            "owner": {"login": owner},
            "description": "A description",
            "language": "Python",
            "topics": ["cli"],
            "stargazers_count": 10,
            "html_url": f"https://github.com/{full_name}",
            "homepage": None,
            "updated_at": "2024-06-01T00:00:00Z",
        },
    }
    base.update(overrides)
    return base


def _readme_response(content: str = "# Hello World") -> dict:
    """Build a GitHub README API response."""
    encoded = base64.b64encode(content.encode()).decode()
    return {"content": encoded, "encoding": "base64"}


def _mock_response(json_data, status_code: int = 200) -> MagicMock:
    """Create a mock httpx.Response with sync .json() and .raise_for_status()."""
    resp = MagicMock()
    resp.json.return_value = json_data
    resp.status_code = status_code
    resp.raise_for_status.return_value = None
    return resp


class TestHeaders:
    """Tests for _headers helper."""

    def test_includes_starred_accept(self) -> None:
        h = _headers()
        assert "application/vnd.github.star+json" in h["Accept"]

    @patch("starz.services.github.settings")
    def test_includes_auth_when_token_present(self, mock_settings) -> None:
        mock_settings.github_token = "ghp_test123"
        h = _headers()
        assert h["Authorization"] == "Bearer ghp_test123"

    @patch("starz.services.github.settings")
    def test_no_auth_when_token_empty(self, mock_settings) -> None:
        mock_settings.github_token = ""
        h = _headers()
        assert "Authorization" not in h


class TestFetchStarredRepos:
    """Tests for fetch_starred_repos."""

    async def test_single_page(self) -> None:
        """Fetches repos from a single page and returns parsed dicts."""
        items = [_starred_item("a/one"), _starred_item("b/two")]

        mock_resp = _mock_response(items)
        empty_resp = _mock_response([])

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(side_effect=[mock_resp, empty_resp])

        repos = await fetch_starred_repos(client)

        assert len(repos) == 2
        assert repos[0]["full_name"] == "a/one"
        assert repos[1]["full_name"] == "b/two"
        assert repos[0]["owner"] == "a"
        assert repos[0]["stargazers_count"] == 10
        assert repos[0]["starred_at"] == "2024-06-01T00:00:00Z"

    async def test_multiple_pages(self) -> None:
        """Paginates through multiple pages until an empty response."""
        page1 = [_starred_item(f"o/r{i}") for i in range(3)]
        page2 = [_starred_item(f"o/s{i}") for i in range(2)]

        resp1 = _mock_response(page1)
        resp2 = _mock_response(page2)
        resp3 = _mock_response([])

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(side_effect=[resp1, resp2, resp3])

        repos = await fetch_starred_repos(client)
        assert len(repos) == 5

    async def test_empty_stars(self) -> None:
        """Returns empty list when user has no starred repos."""
        empty_resp = _mock_response([])

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(return_value=empty_resp)

        repos = await fetch_starred_repos(client)
        assert repos == []

    async def test_extracts_all_fields(self) -> None:
        """All expected fields are extracted from the API response."""
        item = _starred_item("org/tool")
        item["repo"]["topics"] = ["ai", "ml"]
        item["repo"]["homepage"] = "https://tool.dev"
        item["repo"]["language"] = "Rust"

        resp = _mock_response([item])
        empty = _mock_response([])

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(side_effect=[resp, empty])

        repos = await fetch_starred_repos(client)
        r = repos[0]

        assert r["full_name"] == "org/tool"
        assert r["name"] == "tool"
        assert r["owner"] == "org"
        assert r["topics"] == ["ai", "ml"]
        assert r["homepage"] == "https://tool.dev"
        assert r["language"] == "Rust"
        assert r["html_url"] == "https://github.com/org/tool"


class TestFetchReadme:
    """Tests for fetch_readme."""

    @patch("starz.services.github.settings")
    async def test_returns_decoded_content(self, mock_settings) -> None:
        """Fetches and base64-decodes README content."""
        mock_settings.github_token = "ghp_test"

        readme_data = _readme_response("# My Project\nSome content here.")
        resp = _mock_response(readme_data, status_code=200)

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(return_value=resp)

        content = await fetch_readme(client, "owner/repo")

        assert content is not None
        assert content.startswith("# My Project")

    @patch("starz.services.github.settings")
    async def test_truncates_to_4000_chars(self, mock_settings) -> None:
        """README content is truncated to 4000 characters."""
        mock_settings.github_token = "ghp_test"

        long_content = "x" * 8000
        readme_data = _readme_response(long_content)
        resp = _mock_response(readme_data, status_code=200)

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(return_value=resp)

        content = await fetch_readme(client, "owner/repo")

        assert content is not None
        assert len(content) == 4000

    @patch("starz.services.github.settings")
    async def test_returns_none_on_404(self, mock_settings) -> None:
        """Returns None when the repo has no README."""
        mock_settings.github_token = "ghp_test"

        resp = _mock_response({}, status_code=404)

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(return_value=resp)

        content = await fetch_readme(client, "owner/no-readme")
        assert content is None

    @patch("starz.services.github.settings")
    async def test_returns_none_on_timeout(self, mock_settings) -> None:
        """Returns None on timeout instead of raising."""
        mock_settings.github_token = "ghp_test"

        client = AsyncMock(spec=httpx.AsyncClient)
        client.get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))

        content = await fetch_readme(client, "owner/slow-repo")
        assert content is None


class TestFetchReadmes:
    """Tests for fetch_readmes (parallel fetching)."""

    @patch("starz.services.github.fetch_readme")
    async def test_collects_results(self, mock_fetch_readme) -> None:
        """Collects non-None README results into a dict."""

        async def _side_effect(client, full_name):
            if full_name == "a/one":
                return "# One"
            elif full_name == "b/two":
                return "# Two"
            return None

        mock_fetch_readme.side_effect = _side_effect

        repos = [
            {"full_name": "a/one"},
            {"full_name": "b/two"},
            {"full_name": "c/three"},
        ]
        client = AsyncMock(spec=httpx.AsyncClient)

        results = await fetch_readmes(client, repos)

        assert len(results) == 2
        assert results["a/one"] == "# One"
        assert results["b/two"] == "# Two"
        assert "c/three" not in results

    @patch("starz.services.github.fetch_readme")
    async def test_empty_repos_returns_empty(self, mock_fetch_readme) -> None:
        """Returns empty dict when given no repos."""
        client = AsyncMock(spec=httpx.AsyncClient)
        results = await fetch_readmes(client, [])
        assert results == {}


class TestSyncFromGithub:
    """Tests for sync_from_github incremental behavior."""

    @patch("starz.services.github.upsert_repo")
    @patch("starz.services.github.get_db")
    @patch("starz.services.github.fetch_readmes")
    @patch("starz.services.github.fetch_starred_repos")
    async def test_only_fetches_readmes_for_new_repos(
        self,
        mock_fetch_starred,
        mock_fetch_readmes,
        mock_get_db,
        mock_upsert,
    ) -> None:
        """READMEs are only fetched for repos not already in the DB."""
        # Setup: a/existing is already in DB, b/new-repo is not
        mock_fetch_starred.return_value = [
            {
                "full_name": "a/existing",
                "name": "existing",
                "owner": "a",
                "description": "Old repo",
                "language": "Python",
                "topics": [],
                "stargazers_count": 100,
                "html_url": "https://github.com/a/existing",
                "homepage": None,
                "updated_at": "2024-01-01T00:00:00Z",
                "starred_at": "2024-01-01T00:00:00Z",
            },
            {
                "full_name": "b/new-repo",
                "name": "new-repo",
                "owner": "b",
                "description": "New repo",
                "language": "Rust",
                "topics": [],
                "stargazers_count": 50,
                "html_url": "https://github.com/b/new-repo",
                "homepage": None,
                "updated_at": "2024-06-01T00:00:00Z",
                "starred_at": "2024-06-01T00:00:00Z",
            },
        ]

        # Mock DB: "a/existing" already present
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [("a/existing",)]
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        mock_fetch_readmes.return_value = {"b/new-repo": "# New Repo README"}

        result = await sync_from_github()

        # Verify fetch_readmes was called only with the new repo
        call_args = mock_fetch_readmes.call_args
        repos_passed = call_args[0][1]  # second positional arg
        full_names_passed = [r["full_name"] for r in repos_passed]
        assert "b/new-repo" in full_names_passed
        assert "a/existing" not in full_names_passed

        # All repos should still be upserted (2 calls)
        assert mock_upsert.call_count == 2

        # Counts
        assert result["total"] == 2
        assert result["new"] == 1
        assert result["updated"] == 1
        assert result["skipped_readmes"] == 1

    @patch("starz.services.github.upsert_repo")
    @patch("starz.services.github.get_db")
    @patch("starz.services.github.fetch_readmes")
    @patch("starz.services.github.fetch_starred_repos")
    async def test_all_new_repos_get_readmes(
        self,
        mock_fetch_starred,
        mock_fetch_readmes,
        mock_get_db,
        mock_upsert,
    ) -> None:
        """When DB is empty, all repos should have READMEs fetched."""
        mock_fetch_starred.return_value = [
            {
                "full_name": "a/one",
                "name": "one",
                "owner": "a",
                "description": "Repo one",
                "language": "Go",
                "topics": [],
                "stargazers_count": 10,
                "html_url": "https://github.com/a/one",
                "homepage": None,
                "updated_at": "2024-01-01T00:00:00Z",
                "starred_at": "2024-01-01T00:00:00Z",
            },
            {
                "full_name": "b/two",
                "name": "two",
                "owner": "b",
                "description": "Repo two",
                "language": "Python",
                "topics": [],
                "stargazers_count": 20,
                "html_url": "https://github.com/b/two",
                "homepage": None,
                "updated_at": "2024-01-01T00:00:00Z",
                "starred_at": "2024-01-01T00:00:00Z",
            },
        ]

        # Empty DB
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        mock_fetch_readmes.return_value = {"a/one": "# One", "b/two": "# Two"}

        result = await sync_from_github()

        # All repos should be passed to fetch_readmes
        call_args = mock_fetch_readmes.call_args
        repos_passed = call_args[0][1]
        assert len(repos_passed) == 2

        assert result["new"] == 2
        assert result["updated"] == 0
        assert result["skipped_readmes"] == 0

    @patch("starz.services.github.upsert_repo")
    @patch("starz.services.github.get_db")
    @patch("starz.services.github.fetch_readmes")
    @patch("starz.services.github.fetch_starred_repos")
    async def test_existing_repos_get_none_readme(
        self,
        mock_fetch_starred,
        mock_fetch_readmes,
        mock_get_db,
        mock_upsert,
    ) -> None:
        """Existing repos should be upserted with readme_content=None
        so COALESCE in the DB preserves the old README."""
        mock_fetch_starred.return_value = [
            {
                "full_name": "a/existing",
                "name": "existing",
                "owner": "a",
                "description": "Old",
                "language": "Python",
                "topics": [],
                "stargazers_count": 200,
                "html_url": "https://github.com/a/existing",
                "homepage": None,
                "updated_at": "2024-01-01T00:00:00Z",
                "starred_at": "2024-01-01T00:00:00Z",
            },
        ]

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [("a/existing",)]
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        mock_fetch_readmes.return_value = {}

        await sync_from_github()

        # The existing repo should be upserted with readme_content=None
        upsert_call = mock_upsert.call_args_list[0]
        repo_arg = upsert_call[0][1]  # second positional arg to upsert_repo(conn, repo)
        assert repo_arg["readme_content"] is None
