# Starz — GitHub Stars Knowledge Base

## Context

You and Bouba both have hundreds of GitHub stars but can never find anything when you need it. Stars are scattered, uncategorized, and GitHub's own starred page has no search intelligence. The goal is a personal tool that pulls all your stars, auto-categorizes them with AI, generates embeddings for semantic search, and gives you a chat interface to ask "what React animation library did I star?" and get instant answers.

## Architecture

**Single project, two services**: `api/` (Python/FastAPI) + `web/` (Next.js)

- **SQLite + sqlite-vec** for storage — zero config, portable, no Docker needed
- **OpenAI text-embedding-3-small** for embeddings — $0.01 total for ~300 repos
- **Claude Haiku** for batch categorization + summaries — ~$0.02 total
- **Claude Sonnet** for chat/RAG responses
- **httpx** for GitHub API (uses `gh auth token` — no OAuth needed)

## Project Structure

```
starz/
├── pyproject.toml
├── Makefile
├── .env                         # ANTHROPIC_API_KEY, OPENAI_API_KEY
├── .gitignore
│
├── api/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app factory
│   ├── config.py                # env loading
│   ├── db/
│   │   ├── client.py            # SQLite + sqlite-vec connection
│   │   └── schema.sql           # DDL
│   ├── schemas/
│   │   ├── repo.py              # Pydantic models
│   │   └── chat.py
│   ├── services/
│   │   ├── github.py            # Stars fetching + README extraction
│   │   ├── embeddings.py        # OpenAI embedding gen + vec storage
│   │   ├── categorizer.py       # Claude Haiku batch categorization
│   │   ├── search.py            # Vector + keyword search
│   │   └── chat.py              # RAG chat orchestration
│   ├── endpoints/
│   │   ├── sync.py              # POST /api/sync
│   │   ├── repos.py             # GET /api/repos, GET /api/repos/{id}
│   │   ├── search.py            # POST /api/search
│   │   └── chat.py              # POST /api/chat
│   └── data/                    # gitignored — starz.db lives here
│
└── web/
    ├── package.json
    ├── src/app/
    │   ├── layout.tsx
    │   └── page.tsx             # Main: search + repo grid + chat panel
    ├── src/components/
    │   ├── chat-panel.tsx
    │   ├── repo-card.tsx
    │   ├── repo-grid.tsx
    │   ├── search-bar.tsx
    │   ├── category-filter.tsx
    │   └── sync-button.tsx
    └── src/lib/
        └── api.ts               # Fetch wrapper
```

## DB Schema

```sql
CREATE TABLE repos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT UNIQUE NOT NULL,       -- "vercel/next.js"
    name TEXT NOT NULL,
    owner TEXT NOT NULL,
    description TEXT,
    language TEXT,
    topics TEXT,                           -- JSON array: '["react","framework"]'
    stargazers_count INTEGER DEFAULT 0,
    html_url TEXT NOT NULL,
    homepage TEXT,
    updated_at TEXT,
    starred_at TEXT,
    readme_content TEXT,                   -- truncated to 4000 chars
    category TEXT,                         -- AI-assigned
    summary TEXT,                          -- AI-generated 2-3 sentences
    embedding_text TEXT,                   -- what was embedded (for re-embedding)
    synced_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_repos_category ON repos(category);
CREATE INDEX idx_repos_language ON repos(language);

CREATE VIRTUAL TABLE repo_embeddings USING vec0(
    repo_id INTEGER PRIMARY KEY,
    embedding FLOAT[1536]
);
```

## Pipeline Flow

```
1. POST /api/sync
   ├── Fetch starred repos (paginated, 100/page) via GitHub API
   ├── Fetch READMEs in parallel (10 concurrent, 5s timeout each)
   ├── Upsert into repos table
   ├── Generate embeddings (combined: name + desc + language + topics + README)
   ├── Store in repo_embeddings vec table
   └── Batch categorize with Claude Haiku (20 repos per call)

2. POST /api/chat
   ├── Embed the user query
   ├── Vector search top-10 similar repos
   ├── Keyword boost (language/topic matching)
   ├── Merge + deduplicate
   └── Send context + query to Claude Sonnet → response
```

## Categorization Taxonomy (~15 categories)

Frontend Framework, Backend Framework, CLI Tool, ML/AI Library, DevOps/Infrastructure, Database/Storage, UI Component Library, Programming Language/Runtime, Testing Tool, Documentation/Static Site, Security Tool, Data Processing, Mobile Development, Developer Productivity, Other

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sync` | Trigger full star sync |
| GET | `/api/sync/status` | Sync progress |
| GET | `/api/repos` | List repos (?category=, ?language=, ?q=) |
| GET | `/api/repos/{id}` | Single repo detail |
| GET | `/api/stats` | Counts by category/language |
| POST | `/api/search` | Semantic vector search |
| POST | `/api/chat` | RAG chat with history |

## Build Order

### Sprint 1: Foundation
1. Init git repo, `pyproject.toml` with deps
2. `api/db/client.py` — SQLite + sqlite-vec connection manager
3. `api/db/schema.sql` — create tables
4. `api/services/github.py` — fetch all stars + READMEs
5. `api/main.py` — FastAPI app
6. `api/endpoints/sync.py` + `api/endpoints/repos.py`
7. **Verify**: run sync, check repos in DB

### Sprint 2: Intelligence
1. `api/services/embeddings.py` — OpenAI embedding gen + vec storage
2. `api/services/categorizer.py` — Claude Haiku batch calls
3. Wire into sync pipeline
4. `api/services/search.py` — vector + keyword search
5. `api/endpoints/search.py`
6. **Verify**: search "react animation" returns relevant results

### Sprint 3: Chat
1. `api/services/chat.py` — RAG pipeline
2. `api/endpoints/chat.py`
3. **Verify**: ask questions, get accurate recommendations with links

### Sprint 4: Web UI
1. Init Next.js + Tailwind + shadcn/ui in `web/`
2. Build components: search-bar, repo-grid, repo-card, chat-panel, category-filter, sync-button
3. Wire to backend via `lib/api.ts`
4. **Verify**: full flow — sync → browse → search → chat

### Sprint 5: Polish
1. `Makefile` — `make dev`, `make sync`, `make build`
2. `.env.example`, `.gitignore`
3. Error handling, loading states, empty states
4. Update `CLAUDE.md` with project conventions

## Dependencies

**Python**: `fastapi[standard]`, `uvicorn`, `httpx`, `anthropic`, `openai`, `sqlite-vec`, `pydantic`, `python-dotenv`

**Node**: `next`, `react`, `tailwindcss`, `@shadcn/ui`, `lucide-react`

## Verification Plan

1. `make dev` starts both API (port 8000) and web (port 3000)
2. Click "Sync" in UI → watch progress → repos populate
3. Browse by category/language filters
4. Search "python web scraping tool" → get semantic results
5. Chat "what testing libraries do I have starred?" → get accurate answer with links
