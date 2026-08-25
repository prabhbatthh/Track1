from fastapi import APIRouter, status

from app.core.config import get_settings
from app.db.prisma import prisma

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", status_code=status.HTTP_200_OK)
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", status_code=status.HTTP_200_OK)
async def ready() -> dict[str, str]:
    settings = get_settings()
    if settings.app_env != "test":
        await prisma.query_raw("SELECT 1")
    return {"status": "ready"}
