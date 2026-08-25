from enum import StrEnum


class ExpenseCategory(StrEnum):
    STAFF_SALARIES = "staffSalaries"
    BOOK_PROCUREMENT = "bookProcurement"
    UTILITIES = "utilities"
    MARKETING = "marketing"


# ponytail: fixed monthly budget per category — no "set budget" feature exists yet,
# so these are constants until admins can configure them.
EXPENSE_BUDGETS: dict[ExpenseCategory, int] = {
    ExpenseCategory.STAFF_SALARIES: 6000,
    ExpenseCategory.BOOK_PROCUREMENT: 2500,
    ExpenseCategory.UTILITIES: 900,
    ExpenseCategory.MARKETING: 700,
}

# Hall is open 9 AM - 8 PM, matching the seat-booking feature's hours.
OPEN_HOURS = range(9, 21)
