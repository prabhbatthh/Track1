from fastapi import APIRouter, Query

from app.modules.agent.schemas import AgentCatalogResponse
from app.modules.agent.service import get_agent_catalog

router = APIRouter(tags=["Agent Commerce"])


@router.get("/agent/catalog", response_model=AgentCatalogResponse)
async def fetch_agent_catalog(
    limit: int = Query(default=100, ge=1, le=500, description="Max catalog items to return")
):
    """Retrieve machine-readable merchant catalog for AI shopping agents."""
    return await get_agent_catalog(limit=limit)


@router.get("/books/agent-catalog", response_model=AgentCatalogResponse)
async def fetch_books_agent_catalog(
    limit: int = Query(default=100, ge=1, le=500, description="Max catalog items to return")
):
    """Alias route for machine-readable catalog under /books namespace."""
    return await get_agent_catalog(limit=limit)
