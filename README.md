# Starz

AI-powered GitHub stars manager -- search, categorize, and chat with your starred repos.

Starz pulls all your GitHub starred repositories, auto-categorizes them using AI, generates semantic embeddings, and gives you both a CLI and web interface to search and chat with your collection.

## Quick Start

```bash
pip install starz

# Set your API keys
export GITHUB_TOKEN="your-github-token"
export OPENAI_API_KEY="your-openai-key"
export ANTHROPIC_API_KEY="your-anthropic-key"

# Sync your stars
starz sync

# Search from terminal
starz search "react animation library"

# Chat interactively
starz chat

# Launch web UI
starz serve
```

## Features

- **Auto-sync** -- Pulls all your GitHub stars with metadata and READMEs
- **AI categorization** -- Claude Haiku classifies repos into 15 categories with summaries
- **Semantic search** -- Find repos by meaning, not just keywords
- **RAG chat** -- Ask natural language questions about your starred repos
- **Web UI** -- Browse, filter, search, and chat in your browser
- **CLI-first** -- Everything works from the terminal too
- **Local storage** -- SQLite database, no external services needed
- **Fast & cheap** -- ~$0.03 to process 300 repos

## CLI Reference

| Command | Description |
|---------|-------------|
| `starz sync` | Fetch stars, generate embeddings, categorize |
| `starz search "query"` | Semantic search from terminal |
| `starz chat` | Interactive chat REPL |
| `starz serve` | Launch web UI on localhost:7827 |
| `starz --help` | Show all commands |

## API Endpoints

When running `starz serve`, these endpoints are available:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync` | Trigger star sync |
| GET | `/api/sync/status` | Sync progress |
| GET | `/api/repos` | List repos (filters: category, language, q) |
| GET | `/api/repos/{id}` | Repo detail |
| GET | `/api/stats` | Category/language counts |
| POST | `/api/search` | Semantic search |
| POST | `/api/chat` | RAG chat |

## Requirements

- Python 3.11+
- GitHub token (personal access token or `gh` CLI)
- OpenAI API key (for embeddings)
- Anthropic API key (for categorization and chat)

## Development

```bash
git clone https://github.com/your-username/starz.git
cd starz
pip install -e .
cd web && bun install && cd ..
make dev
```

## How It Works

1. **Sync**: Fetches all starred repos via GitHub API, extracts READMEs
2. **Embed**: Generates vector embeddings using OpenAI text-embedding-3-small
3. **Categorize**: Claude Haiku classifies each repo into one of 15 categories
4. **Search**: Combines vector similarity with keyword matching
5. **Chat**: RAG pipeline retrieves relevant repos and generates answers with Claude Sonnet

## License

MIT
