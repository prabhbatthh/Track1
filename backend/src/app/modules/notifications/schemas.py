from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    type: str
    message: str
    read: bool
    created_at: datetime

    @staticmethod
    def from_prisma(notification) -> "NotificationOut":
        return NotificationOut(
            id=notification.id,
            type=notification.type,
            message=notification.message,
            read=notification.read,
            created_at=notification.createdAt,
        )
