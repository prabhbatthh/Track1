from typing import Annotated

from fastapi import APIRouter, Depends
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/me", response_model=list[NotificationOut])
async def list_my_notifications(
    user: Annotated[User, Depends(get_current_user)],
) -> list[NotificationOut]:
    return await service.list_my_notifications(user)


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_as_read(
    notification_id: str, user: Annotated[User, Depends(get_current_user)]
) -> NotificationOut:
    return await service.mark_as_read(user, notification_id)


@router.post("/read-all", response_model=list[NotificationOut])
async def mark_all_as_read(
    user: Annotated[User, Depends(get_current_user)],
) -> list[NotificationOut]:
    return await service.mark_all_as_read(user)
