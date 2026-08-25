from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.loans import service
from app.modules.loans.schemas import LoanCreate, LoanListResponse, LoanOut

router = APIRouter(prefix="/loans", tags=["loans"])

manage_loans = require_role(Role.ADMIN, Role.MANAGER, Role.LIBRARIAN, Role.IT_HEAD)


@router.get("/me", response_model=list[LoanOut])
async def list_my_loans(user: Annotated[User, Depends(get_current_user)]) -> list[LoanOut]:
    return await service.list_my_loans(user.id)


@router.get("/history", response_model=LoanListResponse)
async def list_loan_history(
    _: Annotated[User, Depends(manage_loans)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> LoanListResponse:
    return await service.list_all_loans(page=page, page_size=page_size)


@router.post("", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
async def create_loan(payload: LoanCreate, user: Annotated[User, Depends(manage_loans)]) -> LoanOut:
    return await service.create_loan(user.id, payload)


@router.get("", response_model=list[LoanOut])
async def list_active_loans(_: Annotated[User, Depends(manage_loans)]) -> list[LoanOut]:
    return await service.list_active_loans()


@router.get("/fines", response_model=list[LoanOut])
async def list_fines(_: Annotated[User, Depends(manage_loans)]) -> list[LoanOut]:
    return await service.list_fines()


@router.post("/{loan_id}/return", response_model=LoanOut)
async def return_loan(loan_id: str, _: Annotated[User, Depends(manage_loans)]) -> LoanOut:
    return await service.return_loan(loan_id)


@router.post("/{loan_id}/mark-fine-paid", response_model=LoanOut)
async def mark_fine_paid(loan_id: str, staff: Annotated[User, Depends(manage_loans)]) -> LoanOut:
    return await service.mark_fine_paid(loan_id, actor_id=staff.id)


@router.post("/{loan_id}/remind", status_code=status.HTTP_204_NO_CONTENT)
async def send_reminder(loan_id: str, _: Annotated[User, Depends(manage_loans)]) -> None:
    await service.send_reminder(loan_id)
