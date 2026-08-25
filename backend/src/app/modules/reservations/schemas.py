from datetime import datetime

from pydantic import BaseModel


class ReservationCreate(BaseModel):
    book_id: str


class ReservationOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    status: str  # pending | approved | rejected | cancelled
    due_date: datetime | None
    created_at: datetime
    # Only set while status == "pending" — the member's rank among pending
    # requests for this book, and an estimate of how many days until enough
    # copies free up to reach them (None when it can't be estimated, e.g. no
    # active loans left to count down from).
    queue_position: int | None = None
    eta_days: int | None = None

    @staticmethod
    def from_prisma(
        reservation, *, queue_position: int | None = None, eta_days: int | None = None
    ) -> "ReservationOut":
        return ReservationOut(
            id=reservation.id,
            book_id=reservation.bookId,
            book_title=reservation.book.title,
            status=reservation.status,
            due_date=reservation.loan.dueDate if reservation.loan else None,
            created_at=reservation.createdAt,
            queue_position=queue_position,
            eta_days=eta_days,
        )
