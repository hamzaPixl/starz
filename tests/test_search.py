"""Tests for starz.services.search — combined semantic + keyword search."""

import json
from unittest.mock import MagicMock, patch

import pytest

from starz.services.search import keyword_search, merge_results, search, fts_search


# ---------------------------------------------------------------------------
# keyword_search
# ---------------------------------------------------------------------------
class TestKeywordSearch:
    """Tests for SQL keyword matching."""

    def _make_row(
        self,
        full_name: str,
        description: str = "",
        language: str = "",
        topics: str = "[]",
        **extra,
    ):
        """Build a dict mimicking a sqlite3.Row dict conversion."""
        row = {
            "id": extra.get("id", 1),
            "full_name": full_name,
            "name": full_name.split("/")[-1],
            "owner": full_name.split("/")[0],
            "description": description,
            "language": language,
            "topics": topics,
            "stargazers_count": extra.get("stargazers_count", 100),
            "html_url": f"https://github.com/{full_name}",
            "homepage": None,
            "updated_at": None,
            "starred_at": None,
            "readme_content": None,
            "embedding_text": None,
            "category": extra.get("category"),
            "synced_at": None,
        }
        return row

    def _make_mock_conn(self, rows: list[dict]):
        """Create a mock connection whose execute().fetchall() returns rows."""
        conn = MagicMock()
        mock_rows = []
        for r in rows:
            mock_row = MagicMock()
            mock_row.__iter__ = lambda s: iter(s._data.values())
            mock_row._data = r
            mock_row.__getitem__ = lambda s, k: s._data[k]
            mock_row.get = lambda k, default=None, _r=r: _r.get(k, default)
            mock_row.keys = lambda _r=r: _r.keys()

            def _dict_method(_r=r):
                return dict(_r)

            mock_row.__class__ = dict  # make dict(row) work
            mock_rows.append(r)  # just use dicts directly

        # Use a simpler approach: make fetchall return list of dicts
        # and patch the function to accept that
        cursor_mock = MagicMock()
        cursor_mock.fetchall.return_value = rows
        conn.execute.return_value = cursor_mock
        return conn

    def test_empty_query_returns_empty(self) -> None:
        conn = self._make_mock_conn([])
        result = keyword_search(conn, "")
        assert result == []

    def test_single_word_query(self) -> None:
        row = self._make_row(
            "owner/fastapi", description="A web framework", language="Python"
        )
        conn = self._make_mock_conn([row])
        result = keyword_search(conn, "fastapi")
        assert len(result) == 1
        assert result[0]["full_name"] == "owner/fastapi"
        assert result[0]["score"] == 0.5

    def test_multi_word_query(self) -> None:
        row = self._make_row(
            "org/ml-tool", description="Machine learning toolkit", language="Python"
        )
        conn = self._make_mock_conn([row])
        result = keyword_search(conn, "machine learning")
        assert len(result) == 1

    def test_topics_parsed_from_json(self) -> None:
        row = self._make_row("owner/repo", topics='["ai", "ml"]')
        conn = self._make_mock_conn([row])
        result = keyword_search(conn, "repo")
        assert result[0]["topics"] == ["ai", "ml"]

    def test_empty_topics_becomes_empty_list(self) -> None:
        row = self._make_row("owner/repo", topics="")
        conn = self._make_mock_conn([row])
        result = keyword_search(conn, "repo")
        assert result[0]["topics"] == []

    def test_limit_respected(self) -> None:
        rows = [self._make_row(f"owner/repo{i}", id=i) for i in range(5)]
        conn = self._make_mock_conn(rows)
        result = keyword_search(conn, "repo", limit=3)
        # The limit is passed to SQL, but since we mock fetchall we get all rows back.
        # Still, verify the SQL was called with the limit parameter.
        call_args = conn.execute.call_args
        assert call_args[0][1][-1] == 3  # last param is limit


# ---------------------------------------------------------------------------
# merge_results
# ---------------------------------------------------------------------------
class TestMergeResults:
    """Tests for merging vector and keyword results."""

    def _repo(self, full_name: str, score: float, **extra) -> dict:
        return {"full_name": full_name, "score": score, **extra}

    def test_vector_only(self) -> None:
        vector = [self._repo("a/one", 0.9), self._repo("a/two", 0.7)]
        result = merge_results(vector, [])
        assert len(result) == 2
        assert result[0]["full_name"] == "a/one"

    def test_keyword_only(self) -> None:
        keyword = [self._repo("b/one", 0.5), self._repo("b/two", 0.5)]
        result = merge_results([], keyword)
        assert len(result) == 2

    def test_deduplication(self) -> None:
        vector = [self._repo("a/one", 0.9)]
        keyword = [self._repo("a/one", 0.5)]
        result = merge_results(vector, keyword)
        assert len(result) == 1

    def test_duplicate_gets_score_boost(self) -> None:
        vector = [self._repo("a/one", 0.7)]
        keyword = [self._repo("a/one", 0.5)]
        result = merge_results(vector, keyword)
        assert result[0]["score"] == pytest.approx(0.9)  # 0.7 + 0.2

    def test_score_boost_capped_at_1(self) -> None:
        vector = [self._repo("a/one", 0.95)]
        keyword = [self._repo("a/one", 0.5)]
        result = merge_results(vector, keyword)
        assert result[0]["score"] == 1.0

    def test_sorted_by_score_descending(self) -> None:
        vector = [self._repo("a/low", 0.3)]
        keyword = [self._repo("a/high", 0.5)]
        # keyword score 0.5 > vector score 0.3
        result = merge_results(vector, keyword)
        assert result[0]["full_name"] == "a/high"
        assert result[1]["full_name"] == "a/low"

    def test_max_results_truncates(self) -> None:
        vector = [self._repo(f"a/{i}", 0.9 - i * 0.1) for i in range(5)]
        keyword = [self._repo(f"b/{i}", 0.5) for i in range(5)]
        result = merge_results(vector, keyword, max_results=3)
        assert len(result) == 3

    def test_empty_inputs(self) -> None:
        result = merge_results([], [])
        assert result == []

    def test_vector_results_preferred_over_keyword(self) -> None:
        """When a repo appears in both, the vector result dict is kept (not keyword)."""
        vector = [self._repo("a/one", 0.8, source="vector")]
        keyword = [self._repo("a/one", 0.5, source="keyword")]
        result = merge_results(vector, keyword)
        assert result[0]["source"] == "vector"


# ---------------------------------------------------------------------------
# fts_search
# ---------------------------------------------------------------------------
class TestFtsSearch:
    """Tests for FTS5 full-text search."""

    @patch("starz.services.search.get_db")
    def test_fts_search_returns_results_with_score(self, mock_get_db) -> None:
        """fts_search returns results with a normalized BM25 score."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {
                "id": 1,
                "full_name": "a/fastapi",
                "name": "fastapi",
                "owner": "a",
                "description": "web framework",
                "language": "Python",
                "topics": '["web"]',
                "stargazers_count": 100,
                "html_url": "https://github.com/a/fastapi",
                "homepage": None,
                "updated_at": None,
                "starred_at": None,
                "readme_content": None,
                "embedding_text": None,
                "category": None,
                "synced_at": None,
                "rank": -1.5,
            },
        ]
        mock_conn.execute.return_value = cursor
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        results = fts_search("fastapi")
        assert len(results) == 1
        assert results[0]["full_name"] == "a/fastapi"
        assert results[0]["match_type"] == "fts"
        assert 0 < results[0]["score"] <= 1.0
        assert "rank" not in results[0]

    @patch("starz.services.search.get_db")
    def test_fts_search_parses_topics(self, mock_get_db) -> None:
        """fts_search parses JSON topics into a list."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {
                "id": 1,
                "full_name": "a/repo",
                "name": "repo",
                "owner": "a",
                "description": "desc",
                "language": "Go",
                "topics": '["cli", "tool"]',
                "stargazers_count": 50,
                "html_url": "https://github.com/a/repo",
                "homepage": None,
                "updated_at": None,
                "starred_at": None,
                "readme_content": None,
                "embedding_text": None,
                "category": None,
                "synced_at": None,
                "rank": -0.5,
            },
        ]
        mock_conn.execute.return_value = cursor
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        results = fts_search("cli")
        assert results[0]["topics"] == ["cli", "tool"]

    @patch("starz.services.search.get_db")
    def test_fts_search_empty_results(self, mock_get_db) -> None:
        """fts_search returns empty list when no matches."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        mock_conn.execute.return_value = cursor
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        results = fts_search("nonexistent")
        assert results == []

    @patch("starz.services.search.get_db")
    def test_fts_search_score_normalization(self, mock_get_db) -> None:
        """BM25 rank is normalized to a 0-1 score (higher is better)."""
        mock_conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {
                "id": 1,
                "full_name": "a/repo",
                "name": "repo",
                "owner": "a",
                "description": "desc",
                "language": "Python",
                "topics": "[]",
                "stargazers_count": 10,
                "html_url": "https://github.com/a/repo",
                "homepage": None,
                "updated_at": None,
                "starred_at": None,
                "readme_content": None,
                "embedding_text": None,
                "category": None,
                "synced_at": None,
                "rank": -3.0,
            },
        ]
        mock_conn.execute.return_value = cursor
        mock_get_db.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_get_db.return_value.__exit__ = MagicMock(return_value=False)

        results = fts_search("repo")
        # score = 1 / (1 + abs(-3.0)) = 1 / 4 = 0.25
        assert results[0]["score"] == pytest.approx(0.25)


# ---------------------------------------------------------------------------
# search (integration of vector + fts + merge)
# ---------------------------------------------------------------------------
class TestSearch:
    """Tests for the top-level search function."""

    @patch("starz.services.search.fts_search")
    @patch("starz.services.search.query_similar")
    def test_combines_vector_and_fts(self, mock_query_similar, mock_fts) -> None:
        mock_query_similar.return_value = [
            {"full_name": "a/vec", "score": 0.9, "topics": [], "match_type": "vector"},
        ]
        mock_fts.return_value = [
            {"full_name": "b/fts", "score": 0.6, "topics": [], "match_type": "fts"},
        ]

        results = search("test query")

        assert len(results) == 2
        names = [r["full_name"] for r in results]
        assert "a/vec" in names
        assert "b/fts" in names

    @patch("starz.services.search.fts_search")
    @patch("starz.services.search.query_similar")
    def test_vector_failure_falls_back_to_fts(
        self, mock_query_similar, mock_fts
    ) -> None:
        mock_query_similar.side_effect = Exception("No embeddings")
        mock_fts.return_value = [
            {
                "full_name": "a/fts",
                "score": 0.7,
                "topics": ["cli"],
                "match_type": "fts",
            },
        ]

        results = search("cli tool")

        assert len(results) >= 1
        assert results[0]["full_name"] == "a/fts"

    @patch("starz.services.search.fts_search")
    @patch("starz.services.search.query_similar")
    def test_fts_failure_falls_back_to_vector(
        self, mock_query_similar, mock_fts
    ) -> None:
        mock_query_similar.return_value = [
            {"full_name": "a/vec", "score": 0.8, "topics": [], "match_type": "vector"},
        ]
        mock_fts.side_effect = Exception("FTS table missing")

        results = search("some query")

        assert len(results) == 1
        assert results[0]["full_name"] == "a/vec"

    @patch("starz.services.search.fts_search")
    @patch("starz.services.search.query_similar")
    def test_no_results(self, mock_query_similar, mock_fts) -> None:
        mock_query_similar.return_value = []
        mock_fts.return_value = []

        results = search("nonexistent thing")
        assert results == []
