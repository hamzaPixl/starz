"""Tests for Pydantic schemas (repo + chat)."""

import pytest
from pydantic import ValidationError


class TestRepoOut:
    def test_minimal_valid(self):
        from starz.schemas.repo import RepoOut

        data = {
            "id": 123,
            "full_name": "owner/repo",
            "name": "repo",
            "owner": "owner",
            "html_url": "https://github.com/owner/repo",
        }
        repo = RepoOut(**data)
        assert repo.id == 123
        assert repo.full_name == "owner/repo"
        assert repo.description is None
        assert repo.language is None
        assert repo.topics == []
        assert repo.stargazers_count == 0

    def test_full_valid(self):
        from starz.schemas.repo import RepoOut

        data = {
            "id": 456,
            "full_name": "org/project",
            "name": "project",
            "owner": "org",
            "description": "A cool project",
            "language": "Python",
            "topics": ["ai", "ml"],
            "stargazers_count": 1000,
            "html_url": "https://github.com/org/project",
            "homepage": "https://project.dev",
            "updated_at": "2025-01-01T00:00:00Z",
            "starred_at": "2025-06-15T12:00:00Z",
            "category": "machine-learning",
            "summary": "An ML project",
        }
        repo = RepoOut(**data)
        assert repo.language == "Python"
        assert repo.topics == ["ai", "ml"]
        assert repo.category == "machine-learning"

    def test_missing_required_field_raises(self):
        from starz.schemas.repo import RepoOut

        with pytest.raises(ValidationError):
            RepoOut(id=1, full_name="a/b", name="b")  # missing owner, html_url

    def test_json_schema_title(self):
        from starz.schemas.repo import RepoOut

        assert RepoOut.model_json_schema()["title"] == "RepoOut"

    def test_model_dump_roundtrip(self):
        from starz.schemas.repo import RepoOut

        data = {
            "id": 1,
            "full_name": "a/b",
            "name": "b",
            "owner": "a",
            "html_url": "https://github.com/a/b",
        }
        repo = RepoOut(**data)
        dumped = repo.model_dump()
        assert RepoOut(**dumped) == repo


class TestRepoDetail:
    def test_inherits_repo_out(self):
        from starz.schemas.repo import RepoDetail, RepoOut

        assert issubclass(RepoDetail, RepoOut)

    def test_readme_content_field(self):
        from starz.schemas.repo import RepoDetail

        detail = RepoDetail(
            id=1,
            full_name="a/b",
            name="b",
            owner="a",
            html_url="https://github.com/a/b",
            readme_content="# Hello",
        )
        assert detail.readme_content == "# Hello"

    def test_readme_defaults_to_none(self):
        from starz.schemas.repo import RepoDetail

        detail = RepoDetail(
            id=1,
            full_name="a/b",
            name="b",
            owner="a",
            html_url="https://github.com/a/b",
        )
        assert detail.readme_content is None


class TestRepoFilters:
    def test_defaults(self):
        from starz.schemas.repo import RepoFilters

        filters = RepoFilters()
        assert filters.category is None
        assert filters.language is None
        assert filters.q is None
        assert filters.limit == 50
        assert filters.offset == 0

    def test_custom_values(self):
        from starz.schemas.repo import RepoFilters

        filters = RepoFilters(
            category="tools", language="Rust", q="parser", limit=10, offset=20
        )
        assert filters.category == "tools"
        assert filters.language == "Rust"
        assert filters.q == "parser"
        assert filters.limit == 10
        assert filters.offset == 20


class TestRepoList:
    def test_paginated_response(self):
        from starz.schemas.repo import RepoList, RepoOut

        repo = RepoOut(
            id=1,
            full_name="a/b",
            name="b",
            owner="a",
            html_url="https://github.com/a/b",
        )
        resp = RepoList(repos=[repo], total=100, limit=50, offset=0)
        assert len(resp.repos) == 1
        assert resp.total == 100


class TestSearchModels:
    def test_search_request_defaults(self):
        from starz.schemas.repo import SearchRequest

        req = SearchRequest(query="vector database")
        assert req.query == "vector database"
        assert req.limit == 10

    def test_search_result_has_score(self):
        from starz.schemas.repo import RepoOut, SearchResult

        repo = RepoOut(
            id=1,
            full_name="a/b",
            name="b",
            owner="a",
            html_url="https://github.com/a/b",
        )
        result = SearchResult(repo=repo, score=0.95)
        assert result.score == 0.95

    def test_search_response_structure(self):
        from starz.schemas.repo import RepoOut, SearchResponse, SearchResult

        repo = RepoOut(
            id=1,
            full_name="a/b",
            name="b",
            owner="a",
            html_url="https://github.com/a/b",
        )
        result = SearchResult(repo=repo, score=0.8)
        resp = SearchResponse(results=[result], query="test")
        assert resp.query == "test"
        assert len(resp.results) == 1


class TestStatsResponse:
    def test_stats(self):
        from starz.schemas.repo import StatsResponse

        stats = StatsResponse(
            total=100,
            by_category={"tools": 30, "ml": 70},
            by_language={"Python": 60, "Rust": 40},
        )
        assert stats.total == 100
        assert stats.by_category["tools"] == 30
        assert stats.by_language["Python"] == 60


class TestChatMessage:
    def test_user_message(self):
        from starz.schemas.chat import ChatMessage

        msg = ChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"

    def test_assistant_message(self):
        from starz.schemas.chat import ChatMessage

        msg = ChatMessage(role="assistant", content="Hi there")
        assert msg.role == "assistant"


class TestChatRequest:
    def test_minimal(self):
        from starz.schemas.chat import ChatRequest

        req = ChatRequest(query="What repos do I have?")
        assert req.query == "What repos do I have?"
        assert req.history == []

    def test_with_history(self):
        from starz.schemas.chat import ChatMessage, ChatRequest

        history = [
            ChatMessage(role="user", content="Hi"),
            ChatMessage(role="assistant", content="Hello!"),
        ]
        req = ChatRequest(query="Follow up", history=history)
        assert len(req.history) == 2

    def test_missing_query_raises(self):
        from starz.schemas.chat import ChatRequest

        with pytest.raises(ValidationError):
            ChatRequest()

    def test_json_schema_title(self):
        from starz.schemas.chat import ChatRequest

        assert ChatRequest.model_json_schema()["title"] == "ChatRequest"


class TestChatSource:
    def test_minimal(self):
        from starz.schemas.chat import ChatSource

        src = ChatSource(full_name="a/b", html_url="https://github.com/a/b")
        assert src.category is None
        assert src.summary is None

    def test_full(self):
        from starz.schemas.chat import ChatSource

        src = ChatSource(
            full_name="a/b",
            html_url="https://github.com/a/b",
            category="tools",
            summary="A tool",
        )
        assert src.category == "tools"


class TestChatResponse:
    def test_structure(self):
        from starz.schemas.chat import ChatResponse, ChatSource

        source = ChatSource(full_name="a/b", html_url="https://github.com/a/b")
        resp = ChatResponse(answer="Here is the answer", sources=[source])
        assert resp.answer == "Here is the answer"
        assert len(resp.sources) == 1


class TestPublicExports:
    """Verify that __init__.py re-exports all key models."""

    def test_repo_exports(self):
        from starz.schemas import (
            RepoDetail,
            RepoFilters,
            RepoList,
            RepoOut,
            SearchRequest,
            SearchResponse,
            SearchResult,
            StatsResponse,
        )

        assert RepoOut is not None
        assert RepoDetail is not None
        assert RepoFilters is not None
        assert RepoList is not None
        assert SearchRequest is not None
        assert SearchResult is not None
        assert SearchResponse is not None
        assert StatsResponse is not None

    def test_chat_exports(self):
        from starz.schemas import ChatMessage, ChatRequest, ChatResponse, ChatSource

        assert ChatMessage is not None
        assert ChatRequest is not None
        assert ChatResponse is not None
        assert ChatSource is not None
