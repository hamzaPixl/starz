# Starz

> Your GitHub stars are a mess. Starz fixes that.

AI-powered GitHub stars manager. Pull all your starred repos, auto-categorize them with AI, generate semantic embeddings, compute connections, and explore everything through a CLI + web dashboard.

**The problem**: You've starred hundreds of repos. GitHub's starred page has no search, no categories, no intelligence.

**The fix**: `pip install starz && starz sync` — done.

## Quick Start

```bash
pip install starz

# Set API keys
export GITHUB_TOKEN="ghp_..."       # or just have `gh` CLI installed
export OPENAI_API_KEY="sk-..."      # for embeddings (~$0.01)
export ANTHROPIC_API_KEY="sk-..."   # for categorization + chat (~$0.02)

# Sync your stars
starz sync

# Use it
starz search "react animation library"
starz chat
starz serve   # http://localhost:7827
```

Total cost: **~$0.03** for 300 repos.

## Screenshots

### Dashboard

Category distribution bar, profile insights (topics, languages, creators), and repo cards with health scores. Click any repo to see AI summary + similar repos.

![Dashboard](https://github.com/hamzaPixl/starz/blob/main/.github/screenshots/dashboard.png?raw=true)

### Discover

Health distribution, starring timeline, interest trends, hot topics cloud, ecosystem detection with coverage bars, and stale repo alerts.

![Discover](https://github.com/hamzaPixl/starz/blob/main/.github/screenshots/discover.png?raw=true)

### Chat

RAG-powered conversational search with markdown rendering, source citations, and suggested prompts.

![Chat](https://github.com/hamzaPixl/starz/blob/main/.github/screenshots/chat.png?raw=true)

### CLI

```
$ starz search "authentication middleware"
┏━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━┓
┃ Repo                    ┃ Category  ┃ Language   ┃ Description         ┃ Score ┃
���━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━┩
│ better-auth/better-auth │ Backend   │ TypeScript │ The most comprehen… │  0.66 │
│ Fedict/eid-mw           │ Security  │ C          │ eID Middleware      │  0.66 │
│ nestjs/nest             │ Backend   │ TypeScript │ A progressive Node… │  0.48 │
└─────────────────────────┴───────────┴────────────┴─────────────────────┴───────┘
```

## Features

### Search & Discovery
- **Hybrid search** — FTS5 full-text + vector semantic + metadata filtering
- **RAG chat** — Ask natural language questions, get answers with repo links
- **Similar repos** — Click any repo to see related ones from your collection
- **Ecosystem detection** — Detects your tech stacks (React, Python AI, Node.js, etc.)

### Intelligence
- **AI categorization** — Claude Haiku classifies repos into 15 categories + sub-tags
- **Health scoring** — 0-100 score based on activity, stars, community, maintenance
- **Trend detection** — Tracks your starring velocity, accelerating/declining interests
- **Gap analysis** — Identifies missing tools in your detected ecosystems

### Web Dashboard
- **Category bar** — Proportional distribution of your stars at a glance
- **Repo cards** — Name, description, stars, health score, language, category
- **Detail sidebar** — AI summary, metadata, topics, similar repos
- **Discover page** — Health distribution, timeline, trends, ecosystems, hot topics

### CLI
- **11 commands** — sync, search, chat, serve, report, deep-dive, digest, export, freshness, trends, ecosystems
- **Rich output** — Tables, colors, progress bars via rich

### Data
- **31 fields** per repo (metadata, AI category, sub-tags, health score, embeddings)
- **6 edge types** — similar, shared_topic, temporal, same_owner, ecosystem, depends_on
- **FTS5 index** — Full-text search with BM25 ranking
- **Local SQLite** — No external database, everything in `~/.starz/starz.db`

## CLI Reference

```
starz sync                         Fetch + embed + categorize + compute edges
starz search "query"               Hybrid semantic + full-text search
starz chat                         Interactive RAG chat
starz serve                        Web UI on localhost:7827
starz report [category]            AI landscape report
starz deep-dive <topic>            Comparative topic analysis
starz digest                       Recent activity summary
starz export awesome               Generate awesome-list markdown
starz freshness                    Repos grouped by health tier
starz trends                       Starring velocity + interest shifts
starz ecosystems                   Detect tech stacks + gaps
```

## API Endpoints

`starz serve` exposes a REST API at `http://localhost:7827`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repos` | List repos (filters: `category`, `language`, `q`, `limit`, `offset`) |
| `GET` | `/api/repos/{id}` | Repo detail with README |
| `GET` | `/api/repos/{id}/similar` | Similar repos |
| `GET` | `/api/stats` | Category/language counts |
| `GET` | `/api/stats/full` | Full analytics (topics, owners, timeline, edges) |
| `POST` | `/api/search` | Semantic + FTS search |
| `POST` | `/api/chat` | RAG chat |
| `POST` | `/api/sync` | Trigger sync |
| `GET` | `/api/sync/status` | Sync progress |
| `GET` | `/api/graph` | Graph nodes + edges |
| `GET` | `/api/trends` | Starring trends |
| `GET` | `/api/ecosystems` | Detected tech stacks |
| `GET` | `/api/gaps` | Missing tools in your stacks |
| `GET` | `/api/freshness` | Repos by health tier |
| `GET` | `/api/digest` | Recent activity digest |
| `POST` | `/api/reports/landscape` | AI landscape report |
| `POST` | `/api/reports/deep-dive` | AI topic deep-dive |
| `GET` | `/api/export/awesome` | Awesome-list markdown |

## How It Works

```
starz sync
  ├── Fetch starred repos (GitHub API, paginated)
  ├── Fetch READMEs (parallel, 10 concurrent)
  ├── Store in SQLite (31 columns per repo)
  ├── Generate embeddings (OpenAI text-embedding-3-small)
  ├── Categorize (Claude Haiku, batches of 20)
  ├── Compute edges (similar, topic, owner, temporal, ecosystem, dependency)
  ├── Score health (0-100 composite)
  └── Rebuild FTS5 search index
```

## Tech Stack

| Layer | Tech |
|-------|------|
| CLI | Python 3.11+, typer, rich |
| API | FastAPI, uvicorn |
| Database | SQLite + sqlite-vec + FTS5 |
| Embeddings | OpenAI text-embedding-3-small (1536-dim) |
| Categorization | Claude Haiku (batch) |
| Chat/Reports | Claude Sonnet (RAG) |
| Frontend | Next.js, Tailwind CSS, shadcn/ui |

## Requirements

- Python 3.11+
- GitHub token (or `gh` CLI authenticated)
- OpenAI API key (embeddings)
- Anthropic API key (categorization + chat)

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes* | GitHub personal access token |
| `OPENAI_API_KEY` | Yes | For embeddings (~$0.01/300 repos) |
| `ANTHROPIC_API_KEY` | Yes | For categorization + chat (~$0.02/300 repos) |
| `STARZ_DATA_DIR` | No | Data directory (default: `~/.starz`) |

\* Not required if `gh` CLI is installed and authenticated.

## Development

```bash
git clone https://github.com/hamzaPixl/starz.git
cd starz

# Backend
pip install -e .
starz --help

# Frontend
cd web && bun install && bun run dev

# Build + bundle frontend
make build-web

# Tests (185 passing)
make test
```

## Project Structure

```
src/starz/
  cli.py                 11 CLI commands
  server.py              FastAPI app factory
  config.py              Env loading + paths
  db/                    SQLite + sqlite-vec + FTS5
  services/              github, embeddings, categorizer, search, chat,
                         graph, trends, ecosystems, reports, export
  endpoints/             REST API routes
  schemas/               Pydantic models
  static/                Bundled Next.js frontend

web/
  src/app/               Dashboard, Discover, Chat pages
  src/components/        Shared UI components
  src/lib/               API client, colors, formatters
```

## License

MIT
