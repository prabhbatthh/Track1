from fastapi import APIRouter, Request, status

from app.core.constants import Role
from app.core.rate_limit import limiter
from app.modules.contact.schemas import ContactMessageCreate
from app.modules.notifications import service as notifications_service

router = APIRouter(prefix="/contact", tags=["contact"])

_RECIPIENT_ROLES = {Role.ADMIN, Role.IT_HEAD}


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def submit_contact_message(request: Request, payload: ContactMessageCreate) -> None:
    message = (
        f"{payload.name} ({payload.email}, {payload.phone_number}) at {payload.organization} "
        f"— {payload.subject}\n\n{payload.message}"
    )
    await notifications_service.notify_roles(_RECIPIENT_ROLES, "contact-message", message)
