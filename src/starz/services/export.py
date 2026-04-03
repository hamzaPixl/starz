"""Export services — generate awesome lists, Obsidian vaults, etc."""

from starz.db.client import get_db


def generate_awesome_list() -> str:
    """Generate a curated awesome-list markdown from starred repos."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT full_name, description, language, category, summary, stargazers_count, html_url, health_score "
            "FROM repos ORDER BY category, stargazers_count DESC"
        ).fetchall()

    # Group by category
    categories: dict[str, list] = {}
    for r in rows:
        cat = r["category"] or "Other"
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(r)

    lines = [
        "# My Starred Repos",
        "",
        f"> Auto-generated from {len(rows)} GitHub stars by [Starz](https://github.com/hamzaPixl/starz)",
        "",
        "## Table of Contents",
        "",
    ]

    # TOC
    for cat in sorted(categories.keys()):
        anchor = cat.lower().replace("/", "").replace(" ", "-")
        lines.append(f"- [{cat}](#{anchor}) ({len(categories[cat])})")

    lines.append("")
    lines.append("---")
    lines.append("")

    # Sections
    for cat in sorted(categories.keys()):
        lines.append(f"## {cat}")
        lines.append("")

        for r in categories[cat]:
            desc = r["description"] or r["summary"] or ""
            if len(desc) > 120:
                desc = desc[:117] + "..."
            lang = f" `{r['language']}`" if r["language"] else ""
            stars = r["stargazers_count"]
            health = r["health_score"]

            star_str = f"{stars:,}" if stars < 1000 else f"{stars / 1000:.1f}k"

            lines.append(
                f"- [{r['full_name']}]({r['html_url']}){lang} — {desc} "
                f"(★{star_str}, health:{health})"
            )

        lines.append("")

    return "\n".join(lines)
