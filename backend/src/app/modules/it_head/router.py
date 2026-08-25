from typing import Annotated

from fastapi import APIRouter, Depends
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.it_head import service
from app.modules.it_head.schemas import ITHeadDashboardOut

router = APIRouter(prefix="/it-head", tags=["it-head"])

manage_it_head = require_role(Role.IT_HEAD)


@router.get("/dashboard", response_model=ITHeadDashboardOut)
async def get_dashboard(_: Annotated[User, Depends(manage_it_head)]) -> ITHeadDashboardOut:
    return await service.get_dashboard()
