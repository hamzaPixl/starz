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

    # 4. Compute edges
    with console.status("[bold blue]Computing connections..."):
        from starz.services.graph import compute_all_edges

        edges = compute_all_edges()
    console.print(
        f"[green]Computed {edges['total']} connections "
        f"({edges['similar']} similar, {edges['owner']} owner, {edges['topic']} topic)[/green]"
    )

    # 5. Compute health scores
    with console.status("[bold blue]Computing health scores..."):
        from starz.services.github import compute_health_scores

        scored = compute_health_scores()
    console.print(f"[green]Scored {scored} repos[/green]")

    # 6. Rebuild FTS search index
    with console.status("[bold blue]Rebuilding search index..."):
        from starz.db.client import rebuild_fts

        with get_db() as conn:
            rebuild_fts(conn)
    console.print("[green]Search index rebuilt[/green]")

    # Summary
    with get_db() as conn:
        stats = get_stats(conn)

    console.print("\n[bold]Sync complete![/bold]")
    console.print(f"  Total repos: {stats['total']}")
    console.print(f"  Categories: {len(stats['by_category'])}")
    console.print(f"  Languages: {len(stats['by_language'])}")


@app.command()
def search(query: str = typer.Argument(..., help="Search query")) -> None:
    """Search your starred repos semantically."""
    from starz.services.search import search as do_search

    from rich.table import Table

    with console.status("[bold blue]Searching..."):
        results = do_search(query)

    if not results:
        console.print("[yellow]No results found.[/yellow]")
        raise typer.Exit()

    table = Table(title=f"Results for '{query}'")
    table.add_column("Repo", style="bold cyan", no_wrap=True)
    table.add_column("Category", style="magenta")
    table.add_column("Language", style="green")
    table.add_column("Description", max_width=50)
    table.add_column("Score", justify="right")

    for r in results:
        table.add_row(
            r["full_name"],
            r.get("category") or "\u2014",
            r.get("language") or "\u2014",
            (r.get("description") or "\u2014")[:50],
            f"{r.get('score', 0):.2f}",
        )

    console.print(table)
    console.print(f"\n[dim]{len(results)} results[/dim]")


@app.command()
def chat() -> None:
    """Chat with your starred repos using AI."""
    from starz.services.chat import chat as do_chat

    if not settings.anthropic_api_key:
        console.print("[red]Error: ANTHROPIC_API_KEY not set[/red]")
        raise typer.Exit(1)

    console.print("[bold]Starz Chat[/bold] — Ask questions about your GitHub stars")
    console.print("[dim]Type 'quit' or 'exit' to stop[/dim]\n")

    history: list[dict[str, str]] = []

    while True:
        try:
            query = console.input("[bold cyan]You:[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break

        if not query or query.lower() in ("quit", "exit", "q"):
            console.print("[dim]Goodbye![/dim]")
            break

        with console.status("[bold blue]Thinking..."):
            try:
                result = do_chat(query, history=history)
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                continue

        console.print(f"\n[bold green]Starz:[/bold green] {result['answer']}\n")

        if result["sources"]:
            console.print("[dim]Sources:[/dim]")
            for s in result["sources"]:
                console.print(f"  [dim]• {s['full_name']}[/dim]")
            console.print()

        # Append to history
        history.append({"role": "user", "content": query})
        history.append({"role": "assistant", "content": result["answer"]})


@app.command()
def serve(
    port: int = typer.Option(7827, help="Port to serve on"),
    host: str = typer.Option("127.0.0.1", help="Host to bind to"),
) -> None:
    """Launch the Starz web UI and API server."""
    import uvicorn

    console.print(f"[bold]Starting Starz server on http://{host}:{port}[/bold]")
    uvicorn.run("starz.server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    app()
