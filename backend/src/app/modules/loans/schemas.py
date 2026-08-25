from datetime import datetime

from pydantic import BaseModel

from app.modules.loans.constants import FINE_PER_DAY


class LoanCreate(BaseModel):
    book_id: str
    member_id: str


class LoanOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    member_id: str
    member_name: str
    borrowed_at: datetime
    due_date: datetime
    returned_at: datetime | None
    days_late: int
    fine_amount: int
    fine_paid: bool
    status: str  # active | overdue | returned

    @staticmethod
    def from_prisma(loan, *, now: datetime) -> "LoanOut":
        end = loan.returnedAt or now
        days_late = max(0, (end.date() - loan.dueDate.date()).days)

        if loan.returnedAt is not None:
            loan_status = "returned"
        elif days_late > 0:
            loan_status = "overdue"
        else:
            loan_status = "active"

        return LoanOut(
            id=loan.id,
            book_id=loan.bookId,
            book_title=loan.book.title,
            member_id=loan.memberId,
            member_name=loan.member.fullName,
            borrowed_at=loan.borrowedAt,
            due_date=loan.dueDate,
            returned_at=loan.returnedAt,
            days_late=days_late,
            fine_amount=days_late * FINE_PER_DAY,
            fine_paid=loan.finePaid,
            status=loan_status,
        )


class LoanListResponse(BaseModel):
    items: list[LoanOut]
    total: int
    page: int
    page_size: int
