from fastapi import HTTPException, status

from app.modules.books import repository as books_repository
from app.modules.wishlist import repository


async def list_wishlist(member_id: str) -> list[str]:
    return await repository.list_book_ids_for_member(member_id)


async def add_to_wishlist(member_id: str, book_id: str) -> None:
    book = await books_repository.find_by_id(book_id)
    if book is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    await repository.add(member_id, book_id)


async def remove_from_wishlist(member_id: str, book_id: str) -> None:
    # Idempotent — removing something already absent is a no-op, not an error, so a
    # retried/duplicate optimistic-UI request never surfaces a spurious failure.
    await repository.remove(member_id, book_id)
