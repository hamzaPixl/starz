"""Ecosystem detection — identify technology stacks in starred repos."""

import json

from starz.db.client import get_db

# Known technology ecosystems with their component patterns
ECOSYSTEMS = {
    "React Fullstack": {
        "components": [
            "react",
            "next.js",
            "nextjs",
            "tailwind",
            "shadcn",
            "zustand",
            "react-query",
            "tanstack",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Python AI/ML": {
        "components": [
            "langchain",
            "openai",
            "anthropic",
            "transformers",
            "pytorch",
            "huggingface",
            "llm",
            "embeddings",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Python Web": {
        "components": [
            "fastapi",
            "django",
            "flask",
            "pydantic",
            "sqlalchemy",
            "uvicorn",
            "celery",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Node.js Backend": {
        "components": [
            "express",
            "fastify",
            "nestjs",
            "prisma",
            "typeorm",
            "graphql",
            "trpc",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "DevOps/Cloud": {
        "components": [
            "docker",
            "kubernetes",
            "terraform",
            "github-actions",
            "ci-cd",
            "nginx",
            "cloudflare",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Mobile": {
        "components": [
            "react-native",
            "flutter",
            "swift",
            "swiftui",
            "kotlin",
            "expo",
            "ionic",
        ],
        "match_fields": ["topics", "name", "description", "language"],
        "min_match": 2,
    },
    "Data/Analytics": {
        "components": [
            "pandas",
            "numpy",
            "jupyter",
            "matplotlib",
            "plotly",
            "dbt",
            "airflow",
            "spark",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Auth/Security": {
        "components": [
            "auth",
            "oauth",
            "jwt",
            "nextauth",
            "clerk",
            "supabase-auth",
            "rbac",
            "security",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "AI Agents": {
        "components": [
            "agent",
            "ai-agent",
            "mcp",
            "claude-code",
            "copilot",
            "assistant",
            "autonomous",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
    "Design System": {
        "components": [
            "shadcn",
            "radix",
            "headless-ui",
            "storybook",
            "design-system",
            "component-library",
            "ui-kit",
        ],
        "match_fields": ["topics", "name", "description"],
        "min_match": 2,
    },
}

# Known technology pairs for ecosystem edges
TECH_PAIRS = [
    ("react", "next.js"),
    ("react", "tailwind"),
    ("react", "shadcn"),
    ("react", "zustand"),
    ("react", "react-query"),
    ("next.js", "tailwind"),
    ("next.js", "vercel"),
    ("fastapi", "pydantic"),
    ("fastapi", "uvicorn"),
    ("django", "celery"),
    ("django", "django-rest-framework"),
    ("express", "mongodb"),
    ("prisma", "typescript"),
    ("prisma", "next.js"),
    ("langchain", "openai"),
    ("langchain", "chromadb"),
    ("openai", "anthropic"),
    ("docker", "kubernetes"),
    ("docker", "nginx"),
    ("terraform", "aws"),
    ("pytorch", "transformers"),
    ("pytorch", "huggingface"),
    ("react-native", "expo"),
    ("flutter", "dart"),
    ("supabase", "next.js"),
    ("stripe", "next.js"),
    ("graphql", "apollo"),
    ("trpc", "next.js"),
    ("jest", "testing-library"),
    ("vitest", "testing-library"),
    ("tailwind", "postcss"),
    ("eslint", "prettier"),
]


def _repo_matches_component(repo: dict, component: str, fields: list[str]) -> bool:
    """Check if a repo matches a component keyword."""
    component_lower = component.lower()
    for field in fields:
        value = repo.get(field)
        if not value:
            continue
        if field == "topics":
            topics = json.loads(value) if isinstance(value, str) else value
            if any(component_lower in t.lower() for t in topics):
                return True
        elif field == "language":
            if component_lower in value.lower():
                return True
        else:
            if component_lower in (value or "").lower():
                return True
    return False


def detect_ecosystems() -> dict:
    """Detect which technology ecosystems the user's stars cover."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, full_name, name, description, language, topics, category FROM repos"
        ).fetchall()

    repos = [dict(r) for r in rows]
    results = {}

    for eco_name, eco_def in ECOSYSTEMS.items():
        component_coverage: dict[str, list[str]] = {}

        for component in eco_def["components"]:
            matching = [
                r
                for r in repos
                if _repo_matches_component(r, component, eco_def["match_fields"])
            ]
            if matching:
                component_coverage[component] = [r["full_name"] for r in matching]

        # Check if enough components are covered
        if len(component_coverage) >= eco_def["min_match"]:
            all_repo_names: set[str] = set()
            for names in component_coverage.values():
                all_repo_names.update(names)

            coverage_pct = len(component_coverage) / len(eco_def["components"]) * 100

            results[eco_name] = {
                "coverage": round(coverage_pct, 1),
                "matched_components": list(component_coverage.keys()),
                "missing_components": [
                    c for c in eco_def["components"] if c not in component_coverage
                ],
                "repos": list(all_repo_names),
                "repo_count": len(all_repo_names),
            }

    return results


def compute_ecosystem_edges() -> int:
    """Create edges between repos that belong to the same ecosystem."""
    count = 0
    ecosystems = detect_ecosystems()

    with get_db() as conn:
        conn.execute("DELETE FROM repo_edges WHERE edge_type = 'ecosystem'")

        # Get repo name to ID mapping
        rows = conn.execute("SELECT id, full_name FROM repos").fetchall()
        name_to_id = {r["full_name"]: r["id"] for r in rows}

        for eco_name, eco_data in ecosystems.items():
            repo_ids = [name_to_id[n] for n in eco_data["repos"] if n in name_to_id]

            for i in range(len(repo_ids)):
                for j in range(
                    i + 1, min(len(repo_ids), i + 6)
                ):  # Cap at 5 edges per repo per ecosystem
                    try:
                        conn.execute(
                            """
                            INSERT OR IGNORE INTO repo_edges (source_id, target_id, edge_type, weight)
                            VALUES (?, ?, 'ecosystem', 0.7)
                        """,
                            (repo_ids[i], repo_ids[j]),
                        )
                        count += 1
                    except Exception:
                        pass

    return count


def detect_gaps() -> list[dict]:
    """Identify gaps in the user's technology stacks."""
    ecosystems = detect_ecosystems()
    gaps = []

    for eco_name, eco_data in ecosystems.items():
        if eco_data["missing_components"]:
            for component in eco_data["missing_components"]:
                gaps.append(
                    {
                        "ecosystem": eco_name,
                        "missing": component,
                        "coverage": eco_data["coverage"],
                        "suggestion": f"Consider starring a {component} tool to complete your {eco_name} stack",
                    }
                )

    # Sort by coverage desc (gaps in well-covered ecosystems are more important)
    gaps.sort(key=lambda x: -x["coverage"])
    return gaps
