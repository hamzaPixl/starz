# Starz

> Your GitHub stars are a mess. Starz fixes that.

AI-powered GitHub stars manager that pulls all your starred repos, auto-categorizes them with AI, generates semantic embeddings, and gives you a CLI + web interface to actually find things.

**The problem**: You've starred hundreds of repos over the years. GitHub's starred page has no search, no categories, no intelligence. You can never find that one library you starred 6 months ago.

**The fix**: `pip install starz && starz sync` -- done. All your stars are now categorized, searchable, and chatbot-ready.

## Quick Start

```bash
pip install starz

# Set your API keys (one-time)
export GITHUB_TOKEN="ghp_..."       # or just have `gh` CLI installed
export OPENAI_API_KEY="sk-..."      # for embeddings (~$0.01)
export ANTHROPIC_API_KEY="sk-..."   # for categorization + chat (~$0.02)

# Pull and process all your stars
starz sync

# Now use it
starz search "react animation library"
starz chat
starz serve   # opens web UI at http://localhost:7827
```

Total cost to process ~300 stars: **~$0.03**

## What It Does

```
GitHub Stars ──> starz sync ──> SQLite DB with:
                                 ├── Full metadata (name, desc, language, topics, stars)
                                 ├── README content (truncated)
                                 ├── AI category (1 of 15)
                                 ├── AI summary (2-3 sentences)
                                 └── Vector embedding (1536-dim)
                                       │
                    starz search ◄─────┤  (semantic + keyword)
                    starz chat   ◄─────┤  (RAG with Claude Sonnet)
                    starz serve  ◄─────┘  (web UI with filters)
```

### Categories

Every repo gets auto-classified into one of 15 categories:

Frontend Framework, Backend Framework, CLI Tool, ML/AI Library, DevOps/Infrastructure, Database/Storage, UI Component Library, Programming Language/Runtime, Testing Tool, Documentation/Static Site, Security Tool, Data Processing, Mobile Development, Developer Productivity, Other

## Features

- **One command sync** -- `starz sync` fetches everything, embeds, and categorizes
- **Semantic search** -- "find me a Python web scraping tool" actually works
- **RAG chat** -- Ask questions, get answers with links to your starred repos
- **Web UI** -- Browse grid with category/language filters and a chat panel
- **CLI-first** -- Every feature works from the terminal
- **Incremental** -- Re-running `starz sync` only processes new stars
- **Local** -- SQLite + sqlite-vec, no Docker, no external DB
- **Cheap** -- ~$0.03 per sync for 300 repos

## CLI Reference

```
starz sync                        # Fetch + embed + categorize all stars
starz search "query"              # Semantic search in terminal
starz chat                        # Interactive chat REPL
starz serve                       # Web UI on localhost:7827
starz serve --port 8080           # Custom port
starz --help                      # Show all commands
```

## Web UI

`starz serve` launches a web interface with:

- Repo grid with cards (name, description, language, category, stars)
- Sidebar filters by category and language
- Search bar for text/semantic search
- Chat panel for conversational search with source links
- Sync button to trigger re-sync from the browser

## API

When running `starz serve`, a REST API is available:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync` | Trigger star sync |
| `GET` | `/api/sync/status` | Sync progress |
| `GET` | `/api/repos` | List repos (`?category=`, `?language=`, `?q=`) |
| `GET` | `/api/repos/{id}` | Repo detail with README |
| `GET` | `/api/stats` | Counts by category/language |
| `POST` | `/api/search` | Semantic vector search |
| `POST` | `/api/chat` | RAG chat with conversation history |

## How It Works

1. **Fetch** -- Paginated GitHub API calls to get all starred repos + READMEs (parallel, 10 concurrent)
2. **Store** -- SQLite database at `~/.starz/starz.db` with sqlite-vec extension for vectors
3. **Embed** -- OpenAI `text-embedding-3-small` generates 1536-dim vectors per repo
4. **Categorize** -- Claude Haiku batch-classifies repos (20 per API call) into 15 categories + writes summaries
5. **Search** -- Query embedding + sqlite-vec distance search, merged with keyword matching
6. **Chat** -- Top-10 relevant repos retrieved as context, Claude Sonnet generates natural language answer

## Tech Stack

| Layer | Tech |
|-------|------|
| CLI | Python, typer, rich |
| API | FastAPI, uvicorn |
| Database | SQLite + sqlite-vec |
| Embeddings | OpenAI text-embedding-3-small |
| Categorization | Claude Haiku |
| Chat | Claude Sonnet (RAG) |
| Frontend | Next.js, Tailwind CSS, shadcn/ui |

## Requirements

- Python 3.11+
- API keys: GitHub token, OpenAI, Anthropic

The GitHub token can come from the `GITHUB_TOKEN` env var or automatically from the `gh` CLI (`gh auth token`).

## Development

```bash
git clone https://github.com/hamzaPixl/starz.git
cd starz

# Backend
pip install -e .
starz --help

# Frontend (dev mode)
cd web && bun install && bun run dev

# Build frontend for bundling
make build-web

# Run tests
make test
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes* | GitHub personal access token |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI features |
| `STARZ_DATA_DIR` | No | Data directory (default: `~/.starz`) |

\* Not required if `gh` CLI is installed and authenticated.

Create a `.env` file or export these variables in your shell.

## License

MIT
