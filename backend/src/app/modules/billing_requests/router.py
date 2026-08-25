from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.billing_requests import service
from app.modules.billing_requests.schemas import (
    BillingRequestCreate,
    BillingRequestOut,
    WaiveFineRequest,
)

router = APIRouter(prefix="/billing-requests", tags=["billing-requests"])

file_request = require_role(Role.MANAGER)
decide_request = require_role(Role.ADMIN)


@router.get("", response_model=list[BillingRequestOut])
async def list_requests(_: Annotated[User, Depends(decide_request)]) -> list[BillingRequestOut]:
    return await service.list_pending_requests()


@router.post("", response_model=BillingRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: BillingRequestCreate, user: Annotated[User, Depends(file_request)]
) -> BillingRequestOut:
    return await service.create_request(user.id, payload)


@router.post("/waive-fine", response_model=BillingRequestOut, status_code=status.HTTP_201_CREATED)
async def waive_fine(
    payload: WaiveFineRequest, user: Annotated[User, Depends(decide_request)]
) -> BillingRequestOut:
    return await service.waive_fine(user.id, payload)


@router.post("/{request_id}/approve", response_model=BillingRequestOut)
async def approve_request(
    request_id: str, user: Annotated[User, Depends(decide_request)]
) -> BillingRequestOut:
    return await service.approve_request(request_id, user.id)


@router.post("/{request_id}/reject", response_model=BillingRequestOut)
async def reject_request(
    request_id: str, user: Annotated[User, Depends(decide_request)]
) -> BillingRequestOut:
    return await service.reject_request(request_id, user.id)
