import json

from pydantic import BaseModel, field_validator


class RepoOut(BaseModel):
    """API response model for a single repo."""

    id: int
    full_name: str
    name: str
    owner: str
    description: str | None = None
    language: str | None = None
    topics: list[str] = []
    stargazers_count: int = 0
    html_url: str
    homepage: str | None = None
    updated_at: str | None = None
    starred_at: str | None = None
    category: str | None = None
    summary: str | None = None
    sub_tags: list[str] = []
    license: str | None = None
    forks_count: int = 0
    open_issues_count: int = 0
    created_at_gh: str | None = None
    archived: bool = False
    size_kb: int = 0
    health_score: int = 0

    @field_validator("topics", "sub_tags", mode="before")
    @classmethod
    def parse_json_list(cls, v: any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return []
        if isinstance(v, list):
            return v
        return []


class RepoDetail(RepoOut):
    """Extended repo with README content."""

    readme_content: str | None = None


class RepoFilters(BaseModel):
    """Query parameters for listing repos."""

    category: str | None = None
    language: str | None = None
    q: str | None = None
    limit: int = 50
    offset: int = 0


class RepoList(BaseModel):
    """Paginated list response."""

    repos: list[RepoOut]
    total: int
    limit: int
    offset: int


class SearchRequest(BaseModel):
    """Semantic search request."""

    query: str
    limit: int = 10


class SearchResult(BaseModel):
    """Single search result with score."""

    repo: RepoOut
    score: float


class SearchResponse(BaseModel):
    """Search response with ranked results."""

    results: list[SearchResult]
    query: str


class StatsResponse(BaseModel):
    """Aggregate stats."""

    total: int
    by_category: dict[str, int]
    by_language: dict[str, int]
