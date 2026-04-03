"""Search endpoint: semantic vector + keyword search."""

from fastapi import APIRouter

from starz.schemas.repo import RepoOut, SearchRequest, SearchResponse, SearchResult
from starz.services.search import search as do_search

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def semantic_search(req: SearchRequest):
    """Semantic vector search across starred repos."""
    results = do_search(req.query, limit=req.limit)

    return SearchResponse(
        query=req.query,
        results=[
            SearchResult(
                repo=RepoOut(
                    **{k: v for k, v in r.items() if k in RepoOut.model_fields}
                ),
                score=r.get("score", 0),
            )
            for r in results
        ],
    )
