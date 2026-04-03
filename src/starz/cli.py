import asyncio

import typer
from rich.console import Console

from starz.config import settings
from starz.db.client import get_db, get_stats
from starz.services.categorizer import categorize_repos
from starz.services.embeddings import embed_repos
from starz.services.github import sync_from_github

app = typer.Typer(name="starz", help="AI-powered GitHub stars manager")
console = Console()


@app.command()
def sync() -> None:
    """Fetch GitHub stars, generate embeddings, and categorize repos."""
    # Validate config
    if not settings.github_token:
        console.print(
            "[red]Error: No GitHub token found. Set GITHUB_TOKEN or install gh CLI.[/red]"
        )
        raise typer.Exit(1)

    # 1. Sync from GitHub
    with console.status("[bold blue]Fetching starred repos from GitHub..."):
        result = asyncio.run(sync_from_github())
    console.print(
        f"[green]Fetched {result['total']} repos "
        f"({result['new']} new, {result['updated']} updated)[/green]"
    )

    # 2. Generate embeddings
    if not settings.openai_api_key:
        console.print("[yellow]Skipping embeddings: OPENAI_API_KEY not set[/yellow]")
    else:
        with console.status("[bold blue]Generating embeddings..."):
            embedded = embed_repos()
        console.print(f"[green]Embedded {embedded} repos[/green]")

    # 3. Categorize
    if not settings.anthropic_api_key:
        console.print(
            "[yellow]Skipping categorization: ANTHROPIC_API_KEY not set[/yellow]"
        )
    else:
        with console.status("[bold blue]Categorizing repos..."):
            categorized = categorize_repos()
        console.print(f"[green]Categorized {categorized} repos[/green]")

    # Summary
    with get_db() as conn:
        stats = get_stats(conn)

    console.print("\n[bold]Sync complete![/bold]")
    console.print(f"  Total repos: {stats['total']}")
    console.print(f"  Categories: {len(stats['by_category'])}")
    console.print(f"  Languages: {len(stats['by_language'])}")


@app.command()
def search(query: str) -> None:
    """Search starred repositories using semantic search."""
    console.print(f"Searching for: {query}")


@app.command()
def chat() -> None:
    """Start an interactive chat session about your starred repos."""
    console.print("Starting chat...")


@app.command()
def serve() -> None:
    """Start the web server with UI and API."""
    console.print("Starting server on http://localhost:7827")


if __name__ == "__main__":
    app()
