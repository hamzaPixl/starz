"""Sync endpoint: trigger and monitor the GitHub stars sync pipeline."""

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from starz.config import settings
from starz.services.categorizer import categorize_repos
from starz.services.embeddings import embed_repos
from starz.services.github import sync_from_github

router = APIRouter(tags=["sync"])

# Simple module-level state for sync status
_sync_state: dict = {
    "status": "idle",  # idle, fetching, embedding, categorizing, done, error
    "progress": 0,
    "total": 0,
    "message": "",
}


def _reset_state() -> None:
    _sync_state.update({"status": "idle", "progress": 0, "total": 0, "message": ""})


async def _run_sync() -> None:
    """Background sync pipeline: fetch -> embed -> categorize."""
    try:
        # 1. Fetch from GitHub
        _sync_state.update(
            {"status": "fetching", "message": "Fetching starred repos..."}
        )
        result = await sync_from_github()
        _sync_state.update(
            {
                "progress": result["total"],
                "total": result["total"],
                "message": f"Fetched {result['total']} repos",
            }
        )

        # 2. Embed
        if settings.openai_api_key:
            _sync_state.update(
                {"status": "embedding", "message": "Generating embeddings..."}
            )
            embed_repos()

        # 3. Categorize
        if settings.anthropic_api_key:
            _sync_state.update(
                {"status": "categorizing", "message": "Categorizing repos..."}
            )
            categorize_repos()

        _sync_state.update({"status": "done", "message": "Sync complete!"})

    except Exception as e:
        _sync_state.update({"status": "error", "message": str(e)})


class SyncStatusResponse(BaseModel):
    status: str
    progress: int
    total: int
    message: str


@router.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    """Trigger a full star sync."""
    if _sync_state["status"] in ("fetching", "embedding", "categorizing"):
        return {"error": "Sync already in progress", "status": _sync_state["status"]}

    _reset_state()
    background_tasks.add_task(_run_sync)
    return {"message": "Sync started"}


@router.get("/sync/status", response_model=SyncStatusResponse)
async def sync_status():
    """Get current sync progress."""
    return SyncStatusResponse(**_sync_state)
