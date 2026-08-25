from app.db.prisma import prisma


async def list_book_ids_for_member(member_id: str) -> list[str]:
    rows = await prisma.wishlist.find_many(
        where={"memberId": member_id}, order={"createdAt": "desc"}
    )
    return [row.bookId for row in rows]


async def add(member_id: str, book_id: str) -> None:
    await prisma.wishlist.upsert(
        where={"memberId_bookId": {"memberId": member_id, "bookId": book_id}},
        data={"create": {"memberId": member_id, "bookId": book_id}, "update": {}},
    )


async def remove(member_id: str, book_id: str) -> None:
    await prisma.wishlist.delete_many(where={"memberId": member_id, "bookId": book_id})
