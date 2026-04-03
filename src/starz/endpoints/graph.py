"""Graph endpoints: visualization data and edge queries."""

from fastapi import APIRouter, Query

from starz.services.graph import get_graph_data

router = APIRouter(tags=["graph"])


@router.get("/graph")
async def graph(
    edge_types: str | None = Query(
        None, description="Comma-separated: similar,same_owner,shared_topic"
    ),
):
    """Get full graph data for visualization."""
    types = edge_types.split(",") if edge_types else None
    return get_graph_data(types)


@router.get("/ecosystems")
async def ecosystems():
    """Detect technology ecosystems in starred repos."""
    from starz.services.ecosystems import detect_ecosystems

    return detect_ecosystems()


@router.get("/gaps")
async def gaps():
    """Identify gaps in technology stacks."""
    from starz.services.ecosystems import detect_gaps

    return detect_gaps()
