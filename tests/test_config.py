"""Tests for starz.config module."""

import os
from pathlib import Path
from unittest.mock import patch


class TestSettings:
    """Test Settings configuration class."""

    def test_default_data_dir_is_home_starz(self, tmp_path: Path) -> None:
        """Data dir defaults to ~/.starz/ when STARZ_DATA_DIR is not set."""
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
        fake_home = tmp_path / "fakehome"
        fake_home.mkdir()
        env["HOME"] = str(fake_home)

        with patch.dict(os.environ, env, clear=True):
            # Reimport to pick up new env
            from starz.config import Settings

            s = Settings()

        assert s.data_dir == fake_home / ".starz"

    def test_data_dir_respects_env_override(self, tmp_path: Path) -> None:
        """STARZ_DATA_DIR env var overrides the default data directory."""
        custom_dir = tmp_path / "custom-starz"

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
        env["STARZ_DATA_DIR"] = str(custom_dir)

        with patch.dict(os.environ, env, clear=True):
            from starz.config import Settings

            s = Settings()

        assert s.data_dir == custom_dir
        assert custom_dir.exists()

    def test_data_dir_is_created_on_init(self, tmp_path: Path) -> None:
        """The data directory is auto-created if it does not exist."""
        target = tmp_path / "nonexistent" / "nested"

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
        env["STARZ_DATA_DIR"] = str(target)

        with patch.dict(os.environ, env, clear=True):
            from starz.config import Settings

            s = Settings()

        assert target.exists()
        assert target.is_dir()
        assert s.db_path == target / "starz.db"

    def test_db_path_is_under_data_dir(self, tmp_path: Path) -> None:
        """db_path is always data_dir / 'starz.db'."""
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

            s = Settings()

        assert s.db_path == tmp_path / "starz.db"

    def test_github_token_from_env(self, tmp_path: Path) -> None:
        """GITHUB_TOKEN env var is used when set."""
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
        env["GITHUB_TOKEN"] = "ghp_testtoken123"

        with patch.dict(os.environ, env, clear=True):
            from starz.config import Settings

            s = Settings()

        assert s.github_token == "ghp_testtoken123"

    def test_github_token_falls_back_to_gh_cli(self, tmp_path: Path) -> None:
        """When GITHUB_TOKEN is not set, falls back to `gh auth token`."""
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

        with (
            patch.dict(os.environ, env, clear=True),
            patch("subprocess.run") as mock_run,
        ):
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = "ghp_from_cli\n"

            from starz.config import Settings

            s = Settings()

        assert s.github_token == "ghp_from_cli"

    def test_github_token_empty_when_no_source(self, tmp_path: Path) -> None:
        """GitHub token is empty string when env and gh CLI both unavailable."""
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

        with (
            patch.dict(os.environ, env, clear=True),
            patch("subprocess.run", side_effect=FileNotFoundError),
        ):
            from starz.config import Settings

            s = Settings()

        assert s.github_token == ""

    def test_openai_and_anthropic_keys_from_env(self, tmp_path: Path) -> None:
        """OpenAI and Anthropic API keys are loaded from environment."""
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
        env["OPENAI_API_KEY"] = "sk-openai-test"
        env["ANTHROPIC_API_KEY"] = "sk-ant-test"

        with patch.dict(os.environ, env, clear=True):
            from starz.config import Settings

            s = Settings()

        assert s.openai_api_key == "sk-openai-test"
        assert s.anthropic_api_key == "sk-ant-test"

    def test_openai_and_anthropic_keys_default_empty(self, tmp_path: Path) -> None:
        """OpenAI and Anthropic keys default to empty string."""
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

        with (
            patch.dict(os.environ, env, clear=True),
            patch("subprocess.run", side_effect=FileNotFoundError),
        ):
            from starz.config import Settings

            s = Settings()

        assert s.openai_api_key == ""
        assert s.anthropic_api_key == ""
