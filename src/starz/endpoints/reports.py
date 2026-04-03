"""Report endpoints: landscape, deep-dive, digest, freshness."""

from fastapi import APIRouter, Query

from starz.services.reports import (
    generate_deep_dive,
    generate_digest,
    generate_landscape_report,
)

router = APIRouter(tags=["reports"])


@router.post("/reports/landscape")
async def landscape_report(topic: str | None = Query(None)):
    """Generate a landscape report for the collection or a specific category."""
    report = generate_landscape_report(topic)
    return {"topic": topic, "report": report}


@router.post("/reports/deep-dive")
async def deep_dive(topic: str = Query(...)):
    """Generate a deep-dive analysis for a topic or category."""
    report = generate_deep_dive(topic)
    return {"topic": topic, "report": report}


@router.get("/digest")
async def digest(days: int = Query(7, ge=1, le=90)):
    """Get a digest of recent starring activity."""
    return generate_digest(days)


@router.get("/freshness")
async def freshness():
    """Get repos grouped by freshness tier."""
    from starz.db.client import get_db

    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, full_name, description, language, category, health_score, pushed_at, archived "
            "FROM repos ORDER BY health_score ASC"
        ).fetchall()

    tiers: dict[str, list] = {
        "abandoned": [],
        "slowing_down": [],
        "active": [],
        "thriving": [],
    }
    for r in rows:
        repo = dict(r)
        score = repo["health_score"]
        if score < 25:
            tiers["abandoned"].append(repo)
        elif score < 50:
            tiers["slowing_down"].append(repo)
        elif score < 75:
            tiers["active"].append(repo)
        else:
            tiers["thriving"].append(repo)

    return {
        "tiers": {k: v[:20] for k, v in tiers.items()},  # Cap at 20 per tier
        "counts": {k: len(v) for k, v in tiers.items()},
    }
