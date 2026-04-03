"""Starz configuration loaded from environment variables."""

import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Starz configuration loaded from environment."""

    def __init__(self) -> None:
        self.data_dir = Path(os.environ.get("STARZ_DATA_DIR", Path.home() / ".starz"))
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "starz.db"

        # API keys
        self.github_token = os.environ.get("GITHUB_TOKEN") or self._gh_auth_token()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    def _gh_auth_token(self) -> str:
        """Fallback: get token from gh CLI."""
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout.strip() if result.returncode == 0 else ""
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return ""


settings = Settings()
