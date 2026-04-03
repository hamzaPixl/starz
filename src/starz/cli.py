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

    # 4b. Compute ecosystem edges
    with console.status("[bold blue]Computing ecosystem edges..."):
        from starz.services.ecosystems import compute_ecosystem_edges

        eco_edges = compute_ecosystem_edges()
    console.print(f"[green]  + {eco_edges} ecosystem edges[/green]")

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
def report(topic: str = typer.Argument(None, help="Category to focus on")) -> None:
    """Generate a landscape report about your starred repos."""
    if not settings.anthropic_api_key:
        console.print("[red]Error: ANTHROPIC_API_KEY not set[/red]")
        raise typer.Exit(1)

    from starz.services.reports import generate_landscape_report

    with console.status(
        f"[bold blue]Generating {'collection' if not topic else topic} report..."
    ):
        result = generate_landscape_report(topic)
    console.print(result)


@app.command(name="deep-dive")
def deep_dive(topic: str = typer.Argument(..., help="Topic to analyze")) -> None:
    """Deep-dive analysis of a specific topic in your stars."""
    if not settings.anthropic_api_key:
        console.print("[red]Error: ANTHROPIC_API_KEY not set[/red]")
        raise typer.Exit(1)

    from starz.services.reports import generate_deep_dive

    with console.status(f"[bold blue]Analyzing {topic}..."):
        result = generate_deep_dive(topic)
    console.print(result)


@app.command()
def digest(days: int = typer.Option(7, help="Number of days to cover")) -> None:
    """Show a digest of recent starring activity."""
    from starz.services.reports import generate_digest

    d = generate_digest(days)
    console.print(f"\n[bold]Digest -- last {days} days[/bold]")
    console.print(f"  New stars: {d['new_stars_count']}")

    if d["trending_categories"]:
        console.print("  Trending:")
        for cat, cnt in d["trending_categories"].items():
            console.print(f"    {cat}: {cnt}")

    if d["stale_repos"]:
        console.print(f"\n  [yellow]Stale repos ({len(d['stale_repos'])}):[/yellow]")
        for r in d["stale_repos"][:5]:
            console.print(f"    {r['full_name']} (health: {r['health_score']})")


@app.command()
def export(
    format: str = typer.Argument("awesome", help="Export format: awesome"),
) -> None:
    """Export your starred repos."""
    if format == "awesome":
        from starz.services.export import generate_awesome_list

        console.print(generate_awesome_list())
    else:
        console.print(f"[red]Unknown format: {format}. Available: awesome[/red]")
        raise typer.Exit(1)


@app.command()
def freshness() -> None:
    """Show repos grouped by health/freshness tier."""
    from rich.table import Table

    from starz.db.client import get_db

    with get_db() as conn:
        rows = conn.execute(
            "SELECT full_name, language, category, health_score, pushed_at "
            "FROM repos ORDER BY health_score ASC"
        ).fetchall()

    tiers: dict[str, list] = {
        "abandoned": [],
        "slowing": [],
        "active": [],
        "thriving": [],
    }
    for r in rows:
        score = r["health_score"]
        if score < 25:
            tiers["abandoned"].append(r)
        elif score < 50:
            tiers["slowing"].append(r)
        elif score < 75:
            tiers["active"].append(r)
        else:
            tiers["thriving"].append(r)

    for tier_name, repos in tiers.items():
        if not repos:
            continue
        color = {
            "abandoned": "red",
            "slowing": "yellow",
            "active": "blue",
            "thriving": "green",
        }[tier_name]
        console.print(f"\n[{color}]{tier_name.upper()}[/{color}] ({len(repos)} repos)")
        table = Table(show_header=True)
        table.add_column("Repo", style="cyan", no_wrap=True)
        table.add_column("Health", justify="right")
        table.add_column("Language")
        table.add_column("Category")
        for r in repos[:10]:
            table.add_row(
                r["full_name"],
                str(r["health_score"]),
                r["language"] or "\u2014",
                r["category"] or "\u2014",
            )
        console.print(table)


@app.command()
def trends() -> None:
    """Show trending analysis of your starring patterns."""
    from starz.services.trends import compute_trends

    t = compute_trends()

    console.print("\n[bold]Starring Timeline[/bold]")
    for entry in t["timeline"][-6:]:
        bar = "\u2588" * min(entry["count"], 50)
        console.print(f"  {entry['month']}: {bar} ({entry['count']})")

    if t["accelerating"]:
        console.print("\n[green]Accelerating[/green]")
        for a in t["accelerating"]:
            console.print(
                f"  {a['category']}: {a['previous']} -> {a['recent']} ({a['velocity']})"
            )

    if t["declining"]:
        console.print("\n[yellow]Declining[/yellow]")
        for d in t["declining"]:
            console.print(f"  {d['category']}: {d['previous']} -> {d['recent']}")

    if t["hot_topics"]:
        console.print("\n[bold]Hot Topics[/bold]")
        for h in t["hot_topics"][:10]:
            console.print(f"  {h['topic']}: {h['count']}")


@app.command()
def ecosystems() -> None:
    """Detect technology ecosystems in your starred repos."""
    from starz.services.ecosystems import detect_ecosystems, detect_gaps

    ecos = detect_ecosystems()
    if not ecos:
        console.print("[yellow]No ecosystems detected[/yellow]")
        return

    for name, data in sorted(ecos.items(), key=lambda x: -x[1]["coverage"]):
        bar = "\u2588" * int(data["coverage"] / 5)
        console.print(f"\n[bold]{name}[/bold] ({data['coverage']}%) {bar}")
        console.print(f"  Repos: {data['repo_count']}")
        console.print(f"  Components: {', '.join(data['matched_components'])}")
        if data["missing_components"]:
            console.print(
                f"  [yellow]Missing: {', '.join(data['missing_components'][:5])}[/yellow]"
            )

    gaps = detect_gaps()
    if gaps:
        console.print("\n[bold]Top Gaps[/bold]")
        for g in gaps[:5]:
            console.print(f"  [{g['ecosystem']}] Missing: {g['missing']}")


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
