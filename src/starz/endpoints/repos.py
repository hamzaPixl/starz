"""Repos endpoints: list, detail, and stats."""

from fastapi import APIRouter, HTTPException, Query

from starz.db.client import get_db, get_repo_by_id, get_repos, get_stats
from starz.schemas.repo import RepoDetail, RepoList, RepoOut, StatsResponse

router = APIRouter(tags=["repos"])


@router.get("/repos", response_model=RepoList)
async def list_repos(
    category: str | None = Query(None),
    language: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List starred repos with optional filters."""
    with get_db() as conn:
        repos, total = get_repos(
            conn, category=category, language=language, q=q, limit=limit, offset=offset
        )

    return RepoList(
        repos=[
            RepoOut(**{k: v for k, v in r.items() if k in RepoOut.model_fields})
            for r in repos
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/repos/{repo_id}", response_model=RepoDetail)
async def get_repo(repo_id: int):
    """Get a single repo by ID."""
    with get_db() as conn:
        repo = get_repo_by_id(conn, repo_id)

    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    return RepoDetail(**{k: v for k, v in repo.items() if k in RepoDetail.model_fields})


@router.get("/repos/{repo_id}/similar")
async def similar_repos(repo_id: int, limit: int = Query(5, ge=1, le=20)):
    """Get similar repos based on precomputed graph edges."""
    from starz.services.graph import get_similar_repos

    results = get_similar_repos(repo_id, limit)
    return {"repo_id": repo_id, "similar": results}


@router.get("/stats", response_model=StatsResponse)
async def stats():
    """Get aggregate stats by category and language."""
    with get_db() as conn:
        return StatsResponse(**get_stats(conn))


@router.get("/stats/full")
async def full_stats():
    """Get rich analytics about the entire collection."""
    from starz.services.graph import get_collection_stats

    return get_collection_stats()


@router.get("/trends")
async def trends():
    """Get trending analysis of starring patterns."""
    from starz.services.trends import compute_trends

    return compute_trends()


@router.get("/export/awesome")
async def export_awesome():
    """Generate an awesome-list markdown from starred repos."""
    from fastapi.responses import PlainTextResponse

    from starz.services.export import generate_awesome_list

    return PlainTextResponse(generate_awesome_list(), media_type="text/markdown")
