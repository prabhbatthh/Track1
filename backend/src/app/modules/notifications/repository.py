from prisma import Prisma
from prisma.models import Notification

from app.db.prisma import prisma

# A user's notification history grows without bound over time — cap what a single
# request can return rather than hydrating every row that's ever accumulated.
LIST_LIMIT = 200


async def list_for_user(user_id: str) -> list[Notification]:
    return await prisma.notification.find_many(
        where={"userId": user_id}, order={"createdAt": "desc"}, take=LIST_LIMIT
    )


async def find(notification_id: str) -> Notification | None:
    return await prisma.notification.find_unique(where={"id": notification_id})


async def create(
    user_id: str, type_: str, message: str, *, client: Prisma | None = None
) -> Notification:
    db = client or prisma
    return await db.notification.create(data={"userId": user_id, "type": type_, "message": message})


async def create_many(user_ids: list[str], type_: str, message: str) -> None:
    if not user_ids:
        return
    await prisma.notification.create_many(
        data=[{"userId": user_id, "type": type_, "message": message} for user_id in user_ids]
    )


async def list_active_user_ids_with_roles(role_names: list[str]) -> list[str]:
    users = await prisma.user.find_many(
        where={"role": {"name": {"in": role_names}}, "isActive": True, "deletedAt": None}
    )
    return [user.id for user in users]


async def mark_read(notification_id: str) -> Notification:
    return await prisma.notification.update(where={"id": notification_id}, data={"read": True})


async def mark_all_read(user_id: str) -> None:
    await prisma.notification.update_many(
        where={"userId": user_id, "read": False}, data={"read": True}
    )
