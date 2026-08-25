from typing import Any, Protocol


class _PaginatableModel[T](Protocol):
    async def count(self, *, where: dict) -> int: ...
    async def find_many(self, **kwargs: Any) -> list[T]: ...


async def paginate[T](
    model: _PaginatableModel[T],
    *,
    where: dict,
    order: dict,
    skip: int,
    take: int,
    include: dict | None = None,
) -> tuple[list[T], int]:
    total = await model.count(where=where)
    items = await model.find_many(
        where=where,
        order=order,
        skip=skip,
        take=take,
        **({"include": include} if include else {}),
    )
    return items, total
