from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from prisma.models import User

from app.api.deps import get_optional_user, require_role
from app.core.constants import Role
from app.core.rate_limit import limiter
from app.modules.books import service
from app.modules.books.schemas import (
    BookCreate,
    BookInsightsOut,
    BookListResponse,
    BookOut,
    BookSort,
    BookUpdate,
    IdentifiedBookFields,
    IdentifyCoverRequest,
    SuggestDescriptionRequest,
    SuggestDescriptionResponse,
)

router = APIRouter(prefix="/books", tags=["books"])

manage_books = require_role(Role.ADMIN, Role.LIBRARIAN, Role.MANAGER)
delete_books = require_role(Role.ADMIN)


@router.get("", response_model=BookListResponse)
async def list_books(
    current_user: Annotated[User | None, Depends(get_optional_user)],
    search: Annotated[
        str | None, Query(description="Match against title, author, or description")
    ] = None,
    category: Annotated[str | None, Query(description="Exact category match")] = None,
    sort: Annotated[BookSort, Query()] = "newest",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> BookListResponse:
    return await service.list_books(
        search=search,
        category=category,
        sort=sort,
        page=page,
        page_size=page_size,
        member_id=current_user.id if current_user else None,
    )


@router.get("/{book_id}", response_model=BookOut)
async def get_book(book_id: UUID) -> BookOut:
    return await service.get_book(str(book_id))


@router.get("/{book_id}/related", response_model=list[BookOut])
async def get_related_books(book_id: UUID) -> list[BookOut]:
    return await service.get_related_books(str(book_id))


@router.get("/{book_id}/insights", response_model=BookInsightsOut | None)
async def get_book_insights(book_id: UUID) -> BookInsightsOut | None:
    return await service.get_book_insights(str(book_id))


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
async def create_book(
    payload: BookCreate,
    _: Annotated[User, Depends(manage_books)],
) -> BookOut:
    return await service.create_book(payload)


@router.post("/suggest-description", response_model=SuggestDescriptionResponse)
@limiter.limit("10/minute")
async def suggest_description(
    request: Request,
    payload: SuggestDescriptionRequest,
    _: Annotated[User, Depends(manage_books)],
) -> SuggestDescriptionResponse:
    description = await service.suggest_description(payload)
    return SuggestDescriptionResponse(description=description)


@router.post("/identify-cover", response_model=IdentifiedBookFields)
@limiter.limit("10/minute")
async def identify_cover(
    request: Request,
    payload: IdentifyCoverRequest,
    _: Annotated[User, Depends(manage_books)],
) -> IdentifiedBookFields:
    return await service.identify_cover(payload.image)


@router.put("/{book_id}", response_model=BookOut)
async def update_book(
    book_id: UUID,
    payload: BookUpdate,
    _: Annotated[User, Depends(manage_books)],
) -> BookOut:
    return await service.update_book(str(book_id), payload)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: UUID,
    _: Annotated[User, Depends(delete_books)],
) -> None:
    await service.delete_book(str(book_id))
