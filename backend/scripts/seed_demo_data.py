"""Generates realistic historical demo data (April of the current year through today)
exercising every feature of the app: staff + salaries, guardians + linked children,
100-110 new members per month,
membership/renewal/fine payments (against the updated pricing plans), coupons, loans
(on-time/late/overdue/active), reservations, reviews, reading progress/goals, login
activity, seat bookings + notify requests, events + registrations, community posts/
comments/likes/saves, notifications, expenses (incl. staff salaries), billing/
permission requests, support tickets, book records, and an announcement.

Run from backend/: `uv run python scripts/seed_demo_data.py`
Idempotent at the batch level: if any @seed-demo.example.com user already exists, the
run skips rather than inserting a second batch — safe to invoke on every backend boot
(see app.main's lifespan). Intended for a local dev database only (reads DATABASE_URL
from .env, same as the other scripts/ seeders).
"""

import asyncio
import os
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

# Windows' console defaults to a legacy codepage that can't encode the ₹ sign this
# script prints — same fix as backend/src/app/main.py and start_backend.py. Needed
# here too since app.main's lifespan now runs this script as a piped subprocess,
# which gets that same cp1252 default rather than inheriting a UTF-8 terminal.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
import seed_pricing_plans  # noqa: E402
from prisma import Json  # noqa: E402
from prisma.errors import UniqueViolationError  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.constants import Role  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.prisma import prisma  # noqa: E402
from app.modules.admin.constants import ExpenseCategory  # noqa: E402
from app.modules.loans.constants import (  # noqa: E402
    FINE_PER_DAY,
    LOAN_PERIOD_DAYS,
    RESERVATION_DURATION_CHOICES,
)
from app.modules.seat_booking.constants import SEAT_LABELS  # noqa: E402

SEED_DOMAIN = "seed-demo.example.com"
DEV_PASSWORD_HASH = hash_password(os.environ.get("DEV_SEED_PASSWORD", "SeedDemo123!"))
SEEDABLE_ENVIRONMENTS = {"development", "test", "e2e"}
RNG = random.Random(20260803)

FIRST_NAMES = [
    "Aarav",
    "Vivaan",
    "Aditya",
    "Vihaan",
    "Arjun",
    "Sai",
    "Reyansh",
    "Krishna",
    "Ishaan",
    "Rohan",
    "Kabir",
    "Aryan",
    "Dev",
    "Yash",
    "Karan",
    "Nikhil",
    "Ananya",
    "Diya",
    "Saanvi",
    "Aadhya",
    "Kavya",
    "Myra",
    "Anika",
    "Ira",
    "Riya",
    "Priya",
    "Neha",
    "Pooja",
    "Sneha",
    "Meera",
    "Isha",
    "Tara",
    "Rahul",
    "Amit",
    "Vikram",
    "Sanjay",
    "Rajesh",
    "Suresh",
    "Manoj",
    "Deepak",
]
LAST_NAMES = [
    "Sharma",
    "Verma",
    "Gupta",
    "Singh",
    "Kumar",
    "Patel",
    "Reddy",
    "Rao",
    "Iyer",
    "Nair",
    "Menon",
    "Joshi",
    "Mehta",
    "Shah",
    "Desai",
    "Kapoor",
    "Malhotra",
    "Chopra",
    "Bose",
    "Banerjee",
    "Mukherjee",
    "Chatterjee",
    "Das",
    "Ghosh",
    "Agarwal",
    "Bansal",
    "Jain",
    "Saxena",
    "Tiwari",
    "Pandey",
]

POST_TEMPLATES = [
    "Just finished {title} — what a ride! Highly recommend to anyone who loves this genre.",
    "Currently halfway through {title}. The pacing is incredible so far.",
    "Does anyone else think {title} deserves more attention? Underrated gem.",
    "Started a new reading challenge this month — {title} is book #1!",
    "Book club pick for this month: {title}. Discussion thread below.",
    "Re-reading {title} for the third time and still finding new details.",
]
COMMENT_TEMPLATES = [
    "Totally agree, loved this one too!",
    "Adding this to my to-read list right now.",
    "The ending really surprised me.",
    "Great pick, thanks for sharing.",
    "I had a different take but respect the perspective.",
    "This is one of my all-time favorites.",
]
REVIEW_TEMPLATES = [
    "A gripping read from start to finish — couldn't put it down.",
    "Solid story, though the middle dragged a little for me.",
    "One of the best books I've borrowed from this library so far.",
    "Enjoyed the character development, would recommend.",
    "Not quite what I expected, but still a worthwhile read.",
    "Beautifully written. Already looking forward to a re-read.",
]
SUPPORT_DESCRIPTIONS = {
    "book_reservation": "My reservation queue position hasn't updated in several days, "
    "can someone check?",
    "payment": "I was charged but my membership status still shows as inactive.",
    "seat_booking": "I couldn't cancel my seat booking from the app, it just keeps loading.",
    "harassment": "Another member has been repeatedly leaving inappropriate comments on my posts.",
    "offline_library": "The library was closed during posted opening hours yesterday.",
    "attendance": "The check-in system didn't register my child's visit today.",
    "other": "Just a general question about how the membership renewal process works.",
}
PERMISSION_REASONS = [
    "Need to approve fine waivers directly for walk-in members without escalating each time.",
    "Requesting access to override the seat booking limit during exam season.",
    "Would like permission to issue books for members with an outstanding balance under review.",
    "Need elevated access to manage the book procurement queue this quarter.",
]


def _random_name() -> str:
    return f"{RNG.choice(FIRST_NAMES)} {RNG.choice(LAST_NAMES)}"


def _month_start(moment: datetime) -> datetime:
    return datetime(moment.year, moment.month, 1, tzinfo=UTC)


def _add_months(moment: datetime, delta: int) -> datetime:
    month_index = moment.month - 1 + delta
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    return datetime(year, month, 1, tzinfo=UTC)


def _random_dt_between(start: datetime, end: datetime) -> datetime:
    span = int((end - start).total_seconds())
    if span <= 0:
        return start
    return start + timedelta(seconds=RNG.randint(0, span))


NOW = datetime.now(UTC)
THIS_MONTH_START = _month_start(NOW)

# "Since April" — if run before April, fall back to last year's so the range is
# never empty (an empty MONTH_STARTS would crash the first `MONTH_STARTS[0]` use below).
_seed_start_year = NOW.year if NOW.month >= 4 else NOW.year - 1
MONTH_STARTS = []
_cursor = datetime(_seed_start_year, 4, 1, tzinfo=UTC)
while _cursor <= THIS_MONTH_START:
    MONTH_STARTS.append(_cursor)
    _cursor = _add_months(_cursor, 1)
MONTH_ENDS = [_add_months(start, 1) for start in MONTH_STARTS]

_email_counter = 0


def _next_email(prefix: str) -> str:
    global _email_counter
    _email_counter += 1
    return f"{prefix}{_email_counter:04d}@{SEED_DOMAIN}"


async def _create_user(*, email: str, full_name: str, role_id: str, created_at: datetime):
    return await prisma.user.create(
        data={
            "email": email,
            "passwordHash": DEV_PASSWORD_HASH,
            "fullName": full_name,
            "roleId": role_id,
            "createdAt": created_at,
        }
    )


async def _seed_roles() -> dict[str, str]:
    role_ids = {}
    role_names = (
        Role.ADMIN,
        Role.MANAGER,
        Role.LIBRARIAN,
        Role.IT_HEAD,
        Role.MEMBER,
        Role.GUARDIAN,
    )
    for role_name in role_names:
        role = await prisma.role.upsert(
            where={"name": role_name}, data={"create": {"name": role_name}, "update": {}}
        )
        role_ids[role_name] = role.id
    return role_ids


async def _seed_staff(role_ids: dict[str, str]) -> dict[str, list]:
    roster = [
        (Role.ADMIN, "admin", 1),
        (Role.MANAGER, "manager", 3),
        (Role.LIBRARIAN, "librarian", 2),
        (Role.IT_HEAD, "ithead", 2),
    ]
    staff_started_at = _add_months(MONTH_STARTS[0], -3)
    staff: dict[str, list] = {}
    for role_name, prefix, count in roster:
        staff[role_name] = []
        for _ in range(count):
            user = await _create_user(
                email=_next_email(prefix),
                full_name=_random_name(),
                role_id=role_ids[role_name],
                created_at=staff_started_at,
            )
            staff[role_name].append(user)
    print(f"Seeded {sum(len(v) for v in staff.values())} staff accounts.")
    return staff


async def _seed_guardians_and_children(
    role_ids: dict[str, str], members: list
) -> tuple[list, list]:
    guardians = []
    children = []
    pool = list(members)
    RNG.shuffle(pool)
    guardian_count = 10
    for _ in range(guardian_count):
        if not pool:
            break
        created_at = _random_dt_between(MONTH_STARTS[0], NOW)
        guardian = await _create_user(
            email=_next_email("guardian"),
            full_name=_random_name(),
            role_id=role_ids[Role.GUARDIAN],
            created_at=created_at,
        )
        guardians.append(guardian)
        child_count = RNG.choice([1, 1, 2])
        for _ in range(child_count):
            if not pool:
                break
            child = pool.pop()
            await prisma.guardianlink.create(data={"guardianId": guardian.id, "memberId": child.id})
            children.append(child)
    print(f"Seeded {len(guardians)} guardians linked to {len(children)} children.")
    return guardians, children


async def _seed_members(role_ids: dict[str, str]) -> list:
    members = []
    for month_start, month_end in zip(MONTH_STARTS, MONTH_ENDS, strict=True):
        count = RNG.randint(100, 110)
        for _ in range(count):
            created_at = _random_dt_between(month_start, min(month_end, NOW))
            member = await _create_user(
                email=_next_email("member"),
                full_name=_random_name(),
                role_id=role_ids[Role.MEMBER],
                created_at=created_at,
            )
            members.append(member)
        print(f"Seeded {count} members for {month_start.strftime('%Y-%m')}.")
    return members


async def _seed_coupons(admin_id: str) -> list:
    coupons = []
    specs = [(10, 50), (15, 30), (20, 20), (25, 10), (50, 5)]
    for discount, max_uses in specs:
        code = f"SEED{discount}{max_uses}"
        coupon = await prisma.coupon.create(
            data={
                "code": code,
                "discountPercent": discount,
                "maxUses": max_uses,
                "createdById": admin_id,
                "createdAt": _random_dt_between(MONTH_STARTS[0], NOW),
            }
        )
        await prisma.auditlogentry.create(
            data={
                "actorId": admin_id,
                "action": "couponGenerated",
                "metadata": Json(
                    {
                        "code": coupon.code,
                        "discountPercent": discount,
                        "maxUses": max_uses,
                    }
                ),
                "createdAt": coupon.createdAt,
            }
        )
        coupons.append(coupon)
    print(f"Seeded {len(coupons)} coupons.")
    return coupons


PLAN_WEIGHTS = [("1m", 60), ("3m", 20), ("6m", 12), ("12m", 8)]


def _plan_label(plan) -> str:
    # Matches the exact format the real app generates (see guardian/service.py's
    # renew_child_subscription) so seeded payments read the same as real ones.
    return f"{plan.months} Month — ₹{plan.price}"


async def _seed_membership_payments(members: list, plans: dict, coupons: list) -> None:
    created = 0
    for member in members:
        plan_id = RNG.choices(
            [p for p, _ in PLAN_WEIGHTS], weights=[w for _, w in PLAN_WEIGHTS], k=1
        )[0]
        plan = plans[plan_id]
        amount = plan.price
        coupon = None
        if RNG.random() < 0.12:
            candidate = RNG.choice(coupons)
            if candidate.usesCount < candidate.maxUses:
                coupon = candidate
                amount = round(plan.price * (100 - coupon.discountPercent) / 100)

        payment_at = member.createdAt + timedelta(hours=RNG.randint(0, 36))
        await prisma.payment.create(
            data={
                "userId": member.id,
                "amount": amount,
                "label": _plan_label(plan),
                "planMonths": plan.months,
                "createdAt": payment_at,
            }
        )
        await prisma.notification.create(
            data={
                "userId": member.id,
                "type": "payment-received",
                "message": f"Payment of ₹{amount} received for {_plan_label(plan)}.",
                "createdAt": payment_at,
            }
        )
        if coupon is not None:
            await prisma.coupon.update(
                where={"id": coupon.id}, data={"usesCount": {"increment": 1}}
            )
        created += 1

        # A later renewal for members who joined early enough that a renewal would
        # plausibly be due by now.
        if member.createdAt < NOW - timedelta(days=45) and RNG.random() < 0.3:
            renewal_plan = plans[
                RNG.choices(
                    [p for p, _ in PLAN_WEIGHTS], weights=[w for _, w in PLAN_WEIGHTS], k=1
                )[0]
            ]
            renewal_at = _random_dt_between(payment_at + timedelta(days=30), NOW)
            await prisma.payment.create(
                data={
                    "userId": member.id,
                    "amount": renewal_plan.price,
                    "label": _plan_label(renewal_plan),
                    "planMonths": renewal_plan.months,
                    "createdAt": renewal_at,
                }
            )
            await prisma.notification.create(
                data={
                    "userId": member.id,
                    "type": "payment-received",
                    "message": f"Payment of ₹{renewal_plan.price} received for "
                    f"{_plan_label(renewal_plan)}.",
                    "createdAt": renewal_at,
                }
            )
            created += 1
    print(f"Seeded {created} membership/renewal payments.")


async def _seed_loans(members: list, books: list, staff: dict) -> list[dict]:
    issuers = staff[Role.MANAGER] + staff[Role.LIBRARIAN]
    loans = []
    used_pairs: set[tuple[str, str]] = set()
    for member in members:
        if RNG.random() >= 0.5:
            continue
        loan_count = RNG.choices([1, 2, 3], weights=[55, 30, 15], k=1)[0]
        for _ in range(loan_count):
            book = RNG.choice(books)
            pair = (member.id, book.id)
            if pair in used_pairs:
                continue
            used_pairs.add(pair)

            earliest = member.createdAt + timedelta(hours=RNG.randint(1, 72))
            if earliest >= NOW:
                continue
            borrowed_at = _random_dt_between(earliest, NOW)
            due_date = borrowed_at + timedelta(days=LOAN_PERIOD_DAYS)
            issuer = RNG.choice(issuers)

            data = {
                "bookId": book.id,
                "memberId": member.id,
                "borrowedAt": borrowed_at,
                "dueDate": due_date,
                "createdById": issuer.id,
                "createdAt": borrowed_at,
            }

            fine_amount = 0
            outcome: str
            if due_date <= NOW:
                outcome = RNG.choices(
                    ["on_time", "late", "overdue_unreturned"], weights=[55, 25, 20], k=1
                )[0]
            else:
                outcome = "active"

            if outcome == "on_time":
                data["returnedAt"] = _random_dt_between(borrowed_at + timedelta(days=1), due_date)
            elif outcome == "late":
                returned_at = _random_dt_between(
                    due_date + timedelta(days=1), min(due_date + timedelta(days=10), NOW)
                )
                data["returnedAt"] = returned_at
                days_late = max(1, (returned_at.date() - due_date.date()).days)
                fine_amount = days_late * FINE_PER_DAY
                data["finePaid"] = RNG.random() < 0.6
            elif outcome == "overdue_unreturned":
                days_late = max(1, (NOW.date() - due_date.date()).days)
                fine_amount = days_late * FINE_PER_DAY
                data["finePaid"] = False
            # "active": returnedAt stays unset, no fine yet.

            loan = await prisma.loan.create(data=data)
            loans.append(
                {
                    "loan": loan,
                    "member": member,
                    "book": book,
                    "outcome": outcome,
                    "fine_amount": fine_amount,
                }
            )

            if outcome == "late" and data.get("finePaid"):
                label = "Fines cleared by guardian" if RNG.random() < 0.2 else "Overdue fine"
                await prisma.payment.create(
                    data={
                        "userId": member.id,
                        "amount": fine_amount,
                        "label": label,
                        "createdAt": data["returnedAt"] + timedelta(hours=1),
                    }
                )
            if outcome == "overdue_unreturned":
                await prisma.notification.create(
                    data={
                        "userId": member.id,
                        "type": "fine-reminder",
                        "message": f"Your fine of ₹{fine_amount} for '{book.title}' is overdue.",
                        "createdAt": due_date + timedelta(days=1),
                    }
                )
    print(f"Seeded {len(loans)} loans.")
    return loans


async def _seed_reservations(members: list, books: list, staff: dict) -> None:
    issuers = staff[Role.MANAGER] + staff[Role.LIBRARIAN]
    count = 0
    approved = 0
    sample = RNG.sample(members, k=min(len(members), max(1, len(members) * 15 // 100)))
    for member in sample:
        book = RNG.choice(books)
        created_at = _random_dt_between(
            max(member.createdAt, MONTH_STARTS[0]), NOW - timedelta(hours=1)
        )
        status = RNG.choices(
            ["pending", "approved", "rejected", "cancelled"], weights=[30, 40, 15, 15], k=1
        )[0]

        loan_id = None
        if status == "approved":
            issuer = RNG.choice(issuers)
            borrowed_at = created_at + timedelta(hours=RNG.randint(2, 48))
            if borrowed_at < NOW:
                duration = RNG.choice(RESERVATION_DURATION_CHOICES)
                due_date = borrowed_at + timedelta(days=duration)
                returned_at = (
                    _random_dt_between(borrowed_at + timedelta(hours=6), due_date)
                    if due_date <= NOW and RNG.random() < 0.6
                    else None
                )
                loan = await prisma.loan.create(
                    data={
                        "bookId": book.id,
                        "memberId": member.id,
                        "borrowedAt": borrowed_at,
                        "dueDate": due_date,
                        "returnedAt": returned_at,
                        "createdById": issuer.id,
                        "createdAt": borrowed_at,
                    }
                )
                loan_id = loan.id
                approved += 1
                await prisma.notification.create(
                    data={
                        "userId": member.id,
                        "type": "reservation-approved",
                        "message": f"Your reservation for '{book.title}' was approved.",
                        "createdAt": borrowed_at,
                    }
                )
        elif status == "rejected":
            await prisma.notification.create(
                data={
                    "userId": member.id,
                    "type": "reservation-rejected",
                    "message": f"Your reservation for '{book.title}' was rejected.",
                    "createdAt": created_at + timedelta(hours=6),
                }
            )

        await prisma.reservation.create(
            data={
                "memberId": member.id,
                "bookId": book.id,
                "status": status,
                "loanId": loan_id,
                "createdAt": created_at,
            }
        )
        count += 1
    print(f"Seeded {count} reservations ({approved} approved into loans).")


async def _seed_reviews_and_progress(loans: list[dict]) -> None:
    progress_seen: set[tuple[str, str]] = set()
    progress_count = 0
    review_count = 0
    for entry in loans:
        member = entry["member"]
        book = entry["book"]
        outcome = entry["outcome"]
        loan = entry["loan"]
        pair = (member.id, book.id)
        if pair in progress_seen:
            continue
        progress_seen.add(pair)

        status = "completed" if outcome in ("on_time", "late") else "reading"
        percent = 100 if status == "completed" else RNG.randint(10, 90)
        await prisma.readingprogress.create(
            data={
                "memberId": member.id,
                "bookId": book.id,
                "status": status,
                "percentComplete": percent,
                "updatedAt": loan.returnedAt or loan.borrowedAt + timedelta(days=RNG.randint(1, 5)),
            }
        )
        progress_count += 1

        if status == "completed" and RNG.random() < 0.35:
            await prisma.review.create(
                data={
                    "bookId": book.id,
                    "memberId": member.id,
                    "rating": RNG.choices([3, 4, 5, 2, 1], weights=[30, 35, 20, 10, 5], k=1)[0],
                    "comment": RNG.choice(REVIEW_TEMPLATES),
                    "images": [],
                    "createdAt": loan.returnedAt + timedelta(hours=RNG.randint(1, 48)),
                }
            )
            review_count += 1
    print(f"Seeded {progress_count} reading-progress rows and {review_count} reviews.")


async def _seed_reading_goals(members: list) -> None:
    count = 0
    for member in RNG.sample(members, k=max(1, len(members) * 30 // 100)):
        monthly = RNG.choice([1, 2, 3, 4])
        await prisma.readinggoal.upsert(
            where={"memberId": member.id},
            data={
                "create": {
                    "memberId": member.id,
                    "yearlyGoal": monthly * 12,
                    "monthlyGoal": monthly,
                },
                "update": {},
            },
        )
        count += 1
    print(f"Seeded {count} reading goals.")


async def _seed_login_activity(members: list) -> None:
    count = 0
    for member in RNG.sample(members, k=max(1, len(members) * 30 // 100)):
        span_days = max(1, (min(NOW, MONTH_ENDS[-1]) - member.createdAt).days)
        days_active = min(span_days, RNG.randint(3, 8))
        used_days: set[int] = set()
        for _ in range(days_active):
            offset = RNG.randint(0, span_days)
            if offset in used_days:
                continue
            used_days.add(offset)
            day = (member.createdAt + timedelta(days=offset)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            try:
                await prisma.loginactivity.create(data={"memberId": member.id, "date": day})
                count += 1
            except UniqueViolationError:
                pass
    print(f"Seeded {count} login-activity rows.")


async def _seed_seat_activity(members: list) -> None:
    used_slots: set[tuple[str, str, int]] = set()
    booking_count = 0
    notify_count = 0
    sample = RNG.sample(members, k=max(1, len(members) * 20 // 100))
    for member in sample:
        for _ in range(RNG.choice([1, 1, 2])):
            for _attempt in range(5):
                seat = RNG.choice(SEAT_LABELS)
                day = _random_dt_between(max(member.createdAt, MONTH_STARTS[0]), NOW).date()
                hour = RNG.randint(9, 20)
                key = (seat, day.isoformat(), hour)
                if key in used_slots:
                    continue
                used_slots.add(key)
                await prisma.seatbooking.create(
                    data={
                        "memberId": member.id,
                        "seatLabel": seat,
                        "date": datetime(day.year, day.month, day.day, tzinfo=UTC),
                        "hour": hour,
                        "createdAt": datetime(day.year, day.month, day.day, tzinfo=UTC)
                        - timedelta(days=1),
                    }
                )
                booking_count += 1
                break

    for member in RNG.sample(members, k=min(len(members), 10)):
        seat = RNG.choice(SEAT_LABELS)
        day = _random_dt_between(MONTH_STARTS[-1], NOW).date()
        hour = RNG.randint(9, 20)
        try:
            await prisma.seatnotifyrequest.create(
                data={
                    "memberId": member.id,
                    "seatLabel": seat,
                    "date": datetime(day.year, day.month, day.day, tzinfo=UTC),
                    "hour": hour,
                }
            )
            notify_count += 1
        except UniqueViolationError:
            pass
    print(f"Seeded {booking_count} seat bookings and {notify_count} seat-notify requests.")


async def _seed_events(staff: dict, members: list, guardians: list, books: list) -> None:
    creators = staff[Role.MANAGER] + staff[Role.ADMIN]
    attendees_pool = members + guardians
    event_titles = [
        "Monthly Book Club Meetup",
        "Author Talk & Q&A",
        "Kids' Storytime Hour",
        "Poetry Reading Evening",
        "Genre Spotlight: Mystery & Thrillers",
        "Reading Marathon Kickoff",
    ]
    event_count = 0
    registration_count = 0
    titles = iter(event_titles)
    for i, month_start in enumerate(MONTH_STARTS):
        for _ in range(2):
            title = next(titles, f"Community Event {event_count + 1}")
            creator = RNG.choice(creators)
            capacity = RNG.choice([15, 20, 25, 30])
            is_last_month = i == len(MONTH_STARTS) - 1
            event_date = _random_dt_between(month_start, MONTH_ENDS[i])
            if is_last_month and RNG.random() < 0.3:
                event_date = NOW + timedelta(days=RNG.randint(3, 20))
            book = RNG.choice(books)
            # Events created "for" a future date must themselves have been created in
            # the past — clamp so createdAt never lands after now.
            event_created_at = min(
                event_date - timedelta(days=RNG.randint(5, 15)), NOW - timedelta(hours=1)
            )
            event = await prisma.event.create(
                data={
                    "title": title,
                    "description": f"Join us to discuss {book.title} and connect with "
                    "fellow readers.",
                    "location": "Main Reading Hall",
                    "date": event_date,
                    "capacity": capacity,
                    "createdBy": creator.id,
                    "createdAt": event_created_at,
                }
            )
            event_count += 1

            for manager in RNG.sample(
                staff[Role.MANAGER], k=min(len(staff[Role.MANAGER]), RNG.choice([1, 2]))
            ):
                await prisma.eventmanagerassignment.create(
                    data={"eventId": event.id, "managerId": manager.id}
                )

            registrant_count = min(capacity, RNG.randint(capacity // 2, capacity))
            registrants = RNG.sample(attendees_pool, k=min(len(attendees_pool), registrant_count))
            for registrant in registrants:
                if registrant.createdAt > event.createdAt:
                    continue
                try:
                    await prisma.eventregistration.create(
                        data={
                            "eventId": event.id,
                            "memberId": registrant.id,
                            "createdAt": min(
                                event.createdAt + timedelta(hours=RNG.randint(1, 100)), NOW
                            ),
                        }
                    )
                    registration_count += 1
                except UniqueViolationError:
                    pass
    print(f"Seeded {event_count} events with {registration_count} registrations.")


async def _seed_community(members: list, guardians: list, books: list) -> None:
    authors_pool = members + guardians
    posts = []
    for _ in range(40):
        author = RNG.choice(authors_pool)
        book = RNG.choice(books)
        created_at = _random_dt_between(max(author.createdAt, MONTH_STARTS[0]), NOW)
        post = await prisma.communitypost.create(
            data={
                "authorId": author.id,
                "bookTitle": book.title,
                "content": RNG.choice(POST_TEMPLATES).format(title=book.title),
                "images": [],
                "reported": RNG.random() < 0.07,
                "createdAt": created_at,
            }
        )
        posts.append(post)

    comment_count = 0
    like_count = 0
    save_count = 0
    for post in posts:
        commenters = RNG.sample(authors_pool, k=min(len(authors_pool), RNG.randint(0, 4)))
        top_level_comments = []
        for commenter in commenters:
            comment = await prisma.communitycomment.create(
                data={
                    "postId": post.id,
                    "authorId": commenter.id,
                    "content": RNG.choice(COMMENT_TEMPLATES),
                    "reported": RNG.random() < 0.03,
                    "createdAt": min(post.createdAt + timedelta(hours=RNG.randint(1, 72)), NOW),
                }
            )
            top_level_comments.append(comment)
            comment_count += 1
            if commenter.id != post.authorId:
                await prisma.notification.create(
                    data={
                        "userId": post.authorId,
                        "type": "post-comment",
                        "message": f"{commenter.fullName} commented on your post.",
                        "createdAt": comment.createdAt,
                    }
                )
        if top_level_comments and RNG.random() < 0.4:
            parent = RNG.choice(top_level_comments)
            replier = RNG.choice(authors_pool)
            await prisma.communitycomment.create(
                data={
                    "postId": post.id,
                    "authorId": replier.id,
                    "parentId": parent.id,
                    "content": RNG.choice(COMMENT_TEMPLATES),
                    "createdAt": min(parent.createdAt + timedelta(hours=RNG.randint(1, 24)), NOW),
                }
            )
            comment_count += 1

        likers = RNG.sample(authors_pool, k=min(len(authors_pool), RNG.randint(0, 10)))
        liked_ids: set[str] = set()
        for liker in likers:
            if liker.id in liked_ids:
                continue
            liked_ids.add(liker.id)
            await prisma.communitypostlike.create(
                data={
                    "postId": post.id,
                    "userId": liker.id,
                    "createdAt": min(post.createdAt + timedelta(hours=RNG.randint(1, 96)), NOW),
                }
            )
            like_count += 1
            if liker.id != post.authorId and RNG.random() < 0.3:
                await prisma.notification.create(
                    data={
                        "userId": post.authorId,
                        "type": "post-like",
                        "message": f"{liker.fullName} liked your post.",
                        "createdAt": min(post.createdAt + timedelta(hours=RNG.randint(1, 96)), NOW),
                    }
                )

        savers = RNG.sample(authors_pool, k=min(len(authors_pool), RNG.randint(0, 5)))
        saved_ids: set[str] = set()
        for saver in savers:
            if saver.id in saved_ids:
                continue
            saved_ids.add(saver.id)
            await prisma.communitypostsave.create(
                data={
                    "postId": post.id,
                    "userId": saver.id,
                    "createdAt": min(post.createdAt + timedelta(hours=RNG.randint(1, 96)), NOW),
                }
            )
            save_count += 1

    banned = RNG.choice(members)
    await prisma.communityban.create(data={"userId": banned.id})

    print(
        f"Seeded {len(posts)} community posts, {comment_count} comments, "
        f"{like_count} likes, {save_count} saves, 1 ban."
    )


async def _seed_expenses(staff: dict) -> None:
    admin = staff[Role.ADMIN][0]
    salary_by_role = {
        Role.ADMIN: 2500,
        Role.MANAGER: 1800,
        Role.LIBRARIAN: 1500,
        Role.IT_HEAD: 1600,
    }
    expense_count = 0
    for month_start in MONTH_STARTS:
        pay_day = month_start + timedelta(days=1)
        for role_name, amount in salary_by_role.items():
            for _staff_member in staff[role_name]:
                expense = await prisma.expense.create(
                    data={
                        "category": ExpenseCategory.STAFF_SALARIES.value,
                        "amount": amount,
                        "loggedById": admin.id,
                        "createdAt": pay_day,
                    }
                )
                await prisma.auditlogentry.create(
                    data={
                        "actorId": admin.id,
                        "action": "expenseApproved",
                        "metadata": Json({"category": expense.category, "amount": expense.amount}),
                        "createdAt": pay_day,
                    }
                )
                expense_count += 1

        for category, base_amount in (
            (ExpenseCategory.BOOK_PROCUREMENT, 1200),
            (ExpenseCategory.UTILITIES, 450),
            (ExpenseCategory.MARKETING, 350),
        ):
            for _ in range(RNG.choice([1, 2])):
                amount = base_amount + RNG.randint(-100, 300)
                created_at = _random_dt_between(month_start, min(MONTH_ENDS[-1], NOW))
                expense = await prisma.expense.create(
                    data={
                        "category": category.value,
                        "amount": amount,
                        "loggedById": admin.id,
                        "createdAt": created_at,
                    }
                )
                await prisma.auditlogentry.create(
                    data={
                        "actorId": admin.id,
                        "action": "expenseApproved",
                        "metadata": Json({"category": expense.category, "amount": expense.amount}),
                        "createdAt": created_at,
                    }
                )
                expense_count += 1
    print(
        f"Seeded {expense_count} expenses (incl. staff salaries), with matching audit log entries."
    )


_DECISION_ACTIONS = {
    ("refund", "approved"): "refundIssued",
    ("refund", "rejected"): "refundRejected",
    ("fee_waiver", "approved"): "feeWaived",
    ("fee_waiver", "rejected"): "feeWaiverRejected",
}


async def _seed_billing_requests(members: list, staff: dict) -> None:
    manager = staff[Role.MANAGER][0]
    admin = staff[Role.ADMIN][0]
    count = 0
    decided = 0
    for member in RNG.sample(members, k=min(len(members), 10)):
        req_type = RNG.choice(["refund", "fee_waiver"])
        amount = RNG.choice([50, 100, 150, 200])
        created_at = _random_dt_between(max(member.createdAt, MONTH_STARTS[0]), NOW)
        status = RNG.choices(["pending", "approved", "rejected"], weights=[35, 45, 20], k=1)[0]
        decided_at = created_at + timedelta(days=RNG.randint(1, 4)) if status != "pending" else None
        await prisma.billingrequest.create(
            data={
                "memberId": member.id,
                "createdById": manager.id,
                "type": req_type,
                "amount": amount,
                "reason": "Requesting review of a recent charge discrepancy.",
                "status": status,
                "decidedById": admin.id if status != "pending" else None,
                "decidedAt": decided_at,
                "createdAt": created_at,
            }
        )
        count += 1
        if status != "pending":
            await prisma.auditlogentry.create(
                data={
                    "actorId": admin.id,
                    "action": _DECISION_ACTIONS[(req_type, status)],
                    "metadata": Json({"amount": amount, "memberName": member.fullName}),
                    "createdAt": decided_at,
                }
            )
            decided += 1
        await prisma.notification.create(
            data={
                "userId": manager.id,
                "type": "pending-request",
                "message": f"New {req_type.replace('_', ' ')} request filed for {member.fullName}.",
                "createdAt": created_at,
            }
        )
    print(f"Seeded {count} billing requests ({decided} decided).")


async def _seed_permission_requests(staff: dict) -> None:
    requesters = staff[Role.MANAGER] + staff[Role.LIBRARIAN]
    it_head = staff[Role.IT_HEAD][0]
    count = 0
    for _ in range(8):
        requester = RNG.choice(requesters)
        created_at = _random_dt_between(MONTH_STARTS[0], NOW)
        status = RNG.choices(["pending", "granted", "denied"], weights=[25, 55, 20], k=1)[0]
        decided_at = created_at + timedelta(days=RNG.randint(1, 3)) if status != "pending" else None
        await prisma.permissionrequest.create(
            data={
                "requestedById": requester.id,
                "permission": RNG.choice(
                    [
                        "Approve fine waivers",
                        "Override seat booking limit",
                        "Manage book procurement",
                    ]
                ),
                "reason": RNG.choice(PERMISSION_REASONS),
                "status": status,
                "decidedById": it_head.id if status != "pending" else None,
                "decidedAt": decided_at,
                "createdAt": created_at,
            }
        )
        count += 1
    print(f"Seeded {count} permission requests.")


async def _seed_support_tickets(members: list, guardians: list, staff: dict) -> None:
    staff_pool = staff[Role.ADMIN] + staff[Role.MANAGER] + staff[Role.IT_HEAD]
    member_categories = [
        "book_reservation",
        "payment",
        "seat_booking",
        "harassment",
        "offline_library",
        "other",
    ]
    guardian_categories = ["attendance", "seat_booking", "payment", "other"]
    count = 0
    resolved = 0
    for _ in range(20):
        is_guardian = RNG.random() < 0.3 and guardians
        raiser = RNG.choice(guardians) if is_guardian else RNG.choice(members)
        category = RNG.choice(guardian_categories if is_guardian else member_categories)
        created_at = _random_dt_between(max(raiser.createdAt, MONTH_STARTS[0]), NOW)
        status = RNG.choices(["open", "resolved", "closed"], weights=[40, 35, 25], k=1)[0]
        resolver = RNG.choice(staff_pool)
        resolved_at = created_at + timedelta(days=RNG.randint(1, 5)) if status != "open" else None
        closed_at = resolved_at + timedelta(days=1) if status == "closed" and resolved_at else None
        await prisma.supportticket.create(
            data={
                "raisedById": raiser.id,
                "category": category,
                "description": SUPPORT_DESCRIPTIONS[category],
                "status": status,
                "resolutionNote": (
                    "Resolved after reviewing account activity." if status != "open" else None
                ),
                "resolvedById": resolver.id if status != "open" else None,
                "resolvedAt": resolved_at,
                "closedAt": closed_at,
                "createdAt": created_at,
            }
        )
        count += 1
        if status != "open":
            resolved += 1
        await prisma.notification.create(
            data={
                "userId": resolver.id,
                "type": "support-ticket",
                "message": f"New support ticket raised: {category}.",
                "createdAt": created_at,
            }
        )
    print(f"Seeded {count} support tickets ({resolved} resolved/closed).")


async def _seed_book_records(books: list, staff: dict) -> None:
    it_head = staff[Role.IT_HEAD][0]
    notes = {
        "lost": "Reported missing during annual stock check.",
        "donated": "Donated by a community member.",
        "purchased": "New copy purchased to meet demand.",
    }
    count = 0
    for _ in range(10):
        book = RNG.choice(books)
        record_type = RNG.choice(["lost", "donated", "purchased"])
        created_at = _random_dt_between(MONTH_STARTS[0], NOW)
        await prisma.bookrecord.create(
            data={
                "bookId": book.id,
                "type": record_type,
                "note": notes[record_type],
                "loggedById": it_head.id,
                "createdAt": created_at,
            }
        )
        count += 1
    print(f"Seeded {count} book records.")


async def _seed_announcement(staff: dict, members: list) -> None:
    admin = staff[Role.ADMIN][0]
    message = "This month's featured collection is now live — check out the new arrivals shelf!"
    sent_at = _random_dt_between(MONTH_STARTS[-1], NOW)
    for member in members:
        await prisma.notification.create(
            data={
                "userId": member.id,
                "type": "announcement",
                "message": message,
                "createdAt": sent_at,
                # Seeded as already-acknowledged. AnnouncementPopup treats an unread
                # announcement as one the member still has to cross, so leaving these
                # unread would greet every seeded member with a blocking modal for an
                # announcement no admin sent in their session.
                "read": True,
            }
        )
    await prisma.auditlogentry.create(
        data={
            "actorId": admin.id,
            "action": "announcementSent",
            "metadata": Json({"message": message, "recipientCount": len(members)}),
            "createdAt": sent_at,
        }
    )
    print(f"Seeded 1 announcement to {len(members)} members.")


async def _seed_contact_messages(staff: dict) -> None:
    recipients = staff[Role.ADMIN] + staff[Role.IT_HEAD]
    for i in range(5):
        message = (
            f"Demo Contact {i + 1} (demo{i + 1}@example.com, +910000000{i}) at Demo Org "
            f"— General inquiry\n\nJust exploring what the library platform offers."
        )
        created_at = _random_dt_between(MONTH_STARTS[0], NOW)
        for recipient in recipients:
            await prisma.notification.create(
                data={
                    "userId": recipient.id,
                    "type": "contact-message",
                    "message": message,
                    "createdAt": created_at,
                }
            )
    print("Seeded 5 contact messages.")


async def main() -> None:
    settings = get_settings()
    # Same reasoning as seed_dev_accounts.py: this creates staff accounts with a
    # known password, so it must never run against a real environment.
    if settings.app_env not in SEEDABLE_ENVIRONMENTS:
        sys.exit(
            f"refusing to seed known-password accounts with APP_ENV={settings.app_env!r} — "
            f"allowed only in {sorted(SEEDABLE_ENVIRONMENTS)}"
        )
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        existing = await prisma.user.find_first(where={"email": {"endswith": f"@{SEED_DOMAIN}"}})
        if existing is not None:
            print(f"Demo data already seeded (found {existing.email}) — skipping.")
            return

        print(f"Seeding demo data for {[m.strftime('%Y-%m') for m in MONTH_STARTS]}...")

        # seed_pricing_plans.main() connects/disconnects prisma itself — replicate its
        # upsert here against our already-open connection, but also force price/
        # savePercent to the new baseline (that script normally leaves admin-edited
        # prices untouched on re-run; here we deliberately want the reset).
        for plan in seed_pricing_plans.PLANS:
            await prisma.pricingplan.upsert(
                where={"planId": plan["planId"]},
                data={"create": plan, "update": plan},
            )
        print("Updated pricing plans (1m=₹999 base).")

        role_ids = await _seed_roles()
        staff = await _seed_staff(role_ids)
        books = await prisma.book.find_many()
        if not books:
            raise RuntimeError("No books found — run scripts/seed_books.py first.")

        members = await _seed_members(role_ids)
        guardians, children = await _seed_guardians_and_children(role_ids, members)

        coupons = await _seed_coupons(staff[Role.ADMIN][0].id)
        plans_rows = await prisma.pricingplan.find_many()
        plans = {p.planId: p for p in plans_rows}
        await _seed_membership_payments(members, plans, coupons)

        loans = await _seed_loans(members, books, staff)
        await _seed_reservations(members, books, staff)
        await _seed_reviews_and_progress(loans)
        await _seed_reading_goals(members)
        await _seed_login_activity(members)
        await _seed_seat_activity(members)
        await _seed_events(staff, members, guardians, books)
        await _seed_community(members, guardians, books)
        await _seed_expenses(staff)
        await _seed_billing_requests(members, staff)
        await _seed_permission_requests(staff)
        await _seed_support_tickets(members, guardians, staff)
        await _seed_book_records(books, staff)
        await _seed_announcement(staff, members)
        await _seed_contact_messages(staff)

        print(
            f"\nDone. {len(members)} members, {len(guardians)} guardians, "
            f"{sum(len(v) for v in staff.values())} staff created under @{SEED_DOMAIN}."
        )
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
