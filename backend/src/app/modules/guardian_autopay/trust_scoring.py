from dataclasses import dataclass
from app.db.prisma import prisma


@dataclass
class TrustTierResult:
    tier: str  # "HIGH", "BASELINE", "LOW"
    on_time_rate: float  # 0.0 to 1.0
    on_time_returns: int
    total_returns: int
    multiplier: float  # 1.2, 1.0, 0.7
    sample_size: int


async def calculate_trust_tier(child_id: str) -> TrustTierResult:
    """Calculate deterministic trust tier for a child based on their recent return history.

    Rules:
    - Considers only returned Loan records (where returnedAt is not None).
    - Evaluates up to the most recent 15 returned loans.
    - On-time: returnedAt.date() <= dueDate.date().
    - Tiers:
        - HIGH (>= 90%): multiplier = 1.2
        - BASELINE (>= 70% and < 90%): multiplier = 1.0
        - LOW (< 70%): multiplier = 0.7
    - No returned loans default to BASELINE (rate 0, multiplier 1.0).
    """
    returned_loans = await prisma.loan.find_many(
        where={
            "memberId": child_id,
            "returnedAt": {"not": None},
        },
        order={"returnedAt": "desc"},
        take=15,
    )

    total_returns = len(returned_loans)

    if total_returns == 0:
        return TrustTierResult(
            tier="BASELINE",
            on_time_rate=0.0,
            on_time_returns=0,
            total_returns=0,
            multiplier=1.0,
            sample_size=0,
        )

    on_time_returns = 0
    for loan in returned_loans:
        if loan.returnedAt.date() <= loan.dueDate.date():
            on_time_returns += 1

    on_time_rate = on_time_returns / total_returns

    if on_time_rate >= 0.90:
        tier = "HIGH"
        multiplier = 1.2
    elif on_time_rate >= 0.70:
        tier = "BASELINE"
        multiplier = 1.0
    else:
        tier = "LOW"
        multiplier = 0.7

    return TrustTierResult(
        tier=tier,
        on_time_rate=on_time_rate,
        on_time_returns=on_time_returns,
        total_returns=total_returns,
        multiplier=multiplier,
        sample_size=total_returns,
    )
