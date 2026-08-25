from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.wishlist import service

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=list[str])
async def list_wishlist(user: Annotated[User, Depends(get_current_user)]) -> list[str]:
    return await service.list_wishlist(user.id)


@router.post("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_to_wishlist(
    book_id: str, user: Annotated[User, Depends(get_current_user)]
) -> None:
    await service.add_to_wishlist(user.id, book_id)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_wishlist(
    book_id: str, user: Annotated[User, Depends(get_current_user)]
) -> None:
    await service.remove_from_wishlist(user.id, book_id)
