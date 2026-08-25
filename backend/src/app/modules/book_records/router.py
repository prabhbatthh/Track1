from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.book_records import service
from app.modules.book_records.schemas import BookRecordCreate, BookRecordOut

router = APIRouter(prefix="/book-records", tags=["book-records"])

manage_records = require_role(Role.IT_HEAD)


@router.get("", response_model=list[BookRecordOut])
async def list_records(_: Annotated[User, Depends(manage_records)]) -> list[BookRecordOut]:
    return await service.list_records()


@router.post("", response_model=BookRecordOut, status_code=status.HTTP_201_CREATED)
async def create_record(
    payload: BookRecordCreate, user: Annotated[User, Depends(manage_records)]
) -> BookRecordOut:
    return await service.create_record(user.id, payload)
