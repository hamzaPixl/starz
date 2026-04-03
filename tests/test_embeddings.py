"""Tests for starz.services.embeddings — embedding generation and storage."""

import struct
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from starz.services.embeddings import (
    DIMENSIONS,
    MODEL,
    _serialize_embedding,
    build_embedding_text,
    embed_texts,
)


# ---------------------------------------------------------------------------
# build_embedding_text
# ---------------------------------------------------------------------------
class TestBuildEmbeddingText:
    """Tests for the text assembly function."""

    def test_full_name_only(self) -> None:
        repo = {"full_name": "owner/repo"}
        result = build_embedding_text(repo)
        assert result == "owner/repo"

    def test_with_description(self) -> None:
        repo = {"full_name": "owner/repo", "description": "A cool tool"}
        result = build_embedding_text(repo)
        assert "owner/repo" in result
        assert "A cool tool" in result

    def test_with_language(self) -> None:
        repo = {"full_name": "owner/repo", "language": "Python"}
        result = build_embedding_text(repo)
        assert "Language: Python" in result

    def test_with_topics_list(self) -> None:
        repo = {"full_name": "owner/repo", "topics": ["ai", "ml"]}
        result = build_embedding_text(repo)
        assert "Topics: ai, ml" in result

    def test_with_topics_json_string(self) -> None:
        repo = {"full_name": "owner/repo", "topics": '["fastapi", "web"]'}
        result = build_embedding_text(repo)
        assert "Topics: fastapi, web" in result

    def test_with_empty_topics_list(self) -> None:
        repo = {"full_name": "owner/repo", "topics": []}
        result = build_embedding_text(repo)
        assert "Topics" not in result

    def test_with_empty_topics_json(self) -> None:
        repo = {"full_name": "owner/repo", "topics": "[]"}
        result = build_embedding_text(repo)
        assert "Topics" not in result

    def test_with_readme_content(self) -> None:
        repo = {"full_name": "owner/repo", "readme_content": "# My Repo\nSome docs"}
        result = build_embedding_text(repo)
        assert "# My Repo" in result

    def test_readme_truncated_at_3000_chars(self) -> None:
        long_readme = "x" * 5000
        repo = {"full_name": "owner/repo", "readme_content": long_readme}
        result = build_embedding_text(repo)
        # The readme portion should be at most 3000 chars
        # full text = "owner/repo | " + 3000 x's
        assert len(result) <= len("owner/repo | ") + 3000

    def test_all_fields(self) -> None:
        repo = {
            "full_name": "org/project",
            "description": "An ML project",
            "language": "Python",
            "topics": ["ai", "ml"],
            "readme_content": "# Project\nDetails here",
        }
        result = build_embedding_text(repo)
        parts = result.split(" | ")
        assert parts[0] == "org/project"
        assert parts[1] == "An ML project"
        assert parts[2] == "Language: Python"
        assert parts[3] == "Topics: ai, ml"
        assert parts[4] == "# Project\nDetails here"

    def test_separator_is_pipe(self) -> None:
        repo = {"full_name": "a/b", "description": "desc", "language": "Go"}
        result = build_embedding_text(repo)
        assert " | " in result


# ---------------------------------------------------------------------------
# _serialize_embedding
# ---------------------------------------------------------------------------
class TestSerializeEmbedding:
    """Tests for the binary serialization function."""

    def test_output_is_bytes(self) -> None:
        emb = [0.1, 0.2, 0.3]
        result = _serialize_embedding(emb)
        assert isinstance(result, bytes)

    def test_length_matches_dimensions(self) -> None:
        emb = [0.0] * DIMENSIONS
        result = _serialize_embedding(emb)
        # Each float is 4 bytes
        assert len(result) == DIMENSIONS * 4

    def test_roundtrip(self) -> None:
        emb = [1.0, 2.0, 3.0, 4.0]
        serialized = _serialize_embedding(emb)
        deserialized = list(struct.unpack(f"{len(emb)}f", serialized))
        assert deserialized == pytest.approx(emb)


# ---------------------------------------------------------------------------
# embed_texts (with mocked OpenAI client)
# ---------------------------------------------------------------------------
class TestEmbedTexts:
    """Tests for the OpenAI embedding call wrapper."""

    def _make_mock_client(self, embeddings: list[list[float]]) -> MagicMock:
        """Create a mock OpenAI client that returns given embeddings."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [SimpleNamespace(embedding=emb) for emb in embeddings]
        mock_client.embeddings.create.return_value = mock_response
        return mock_client

    def test_returns_embeddings(self) -> None:
        fake_embeddings = [[0.1, 0.2], [0.3, 0.4]]
        client = self._make_mock_client(fake_embeddings)

        result = embed_texts(["hello", "world"], client=client)

        assert result == fake_embeddings
        client.embeddings.create.assert_called_once_with(
            input=["hello", "world"], model=MODEL
        )

    def test_single_text(self) -> None:
        fake_embeddings = [[0.5, 0.6, 0.7]]
        client = self._make_mock_client(fake_embeddings)

        result = embed_texts(["just one"], client=client)

        assert len(result) == 1
        assert result[0] == [0.5, 0.6, 0.7]

    def test_passes_correct_model(self) -> None:
        client = self._make_mock_client([[0.0]])

        embed_texts(["test"], client=client)

        call_kwargs = client.embeddings.create.call_args
        assert call_kwargs.kwargs["model"] == "text-embedding-3-small"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
class TestConstants:
    """Verify module-level constants."""

    def test_model_name(self) -> None:
        assert MODEL == "text-embedding-3-small"

    def test_dimensions(self) -> None:
        assert DIMENSIONS == 1536
