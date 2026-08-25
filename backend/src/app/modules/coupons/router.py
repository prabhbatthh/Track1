from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.coupons import service
from app.modules.coupons.schemas import CouponCreate, CouponOut, CouponValidationOut

router = APIRouter(prefix="/coupons", tags=["coupons"])

manage_coupons = require_role(Role.ADMIN)


@router.get("", response_model=list[CouponOut])
async def list_coupons(_: Annotated[User, Depends(manage_coupons)]) -> list[CouponOut]:
    return await service.list_coupons()


@router.post("", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def generate_coupon(
    payload: CouponCreate, user: Annotated[User, Depends(manage_coupons)]
) -> CouponOut:
    return await service.generate_coupon(user.id, payload)


@router.get("/{code}/validate", response_model=CouponValidationOut)
async def validate_coupon(
    code: str, _: Annotated[User, Depends(get_current_user)]
) -> CouponValidationOut:
    return await service.validate_coupon(code)
