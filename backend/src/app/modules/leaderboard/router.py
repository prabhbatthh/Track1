from typing import Annotated

from fastapi import APIRouter, Depends
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.leaderboard import service
from app.modules.leaderboard.schemas import LeaderboardEntryOut

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntryOut])
async def get_leaderboard(
    user: Annotated[User, Depends(get_current_user)],
) -> list[LeaderboardEntryOut]:
    return await service.get_leaderboard(user.id)
