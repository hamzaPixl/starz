import typer
from rich.console import Console

app = typer.Typer(name="starz", help="AI-powered GitHub stars manager")
console = Console()


@app.command()
def sync() -> None:
    """Sync GitHub starred repositories to local database."""
    console.print("Syncing GitHub stars...")


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
