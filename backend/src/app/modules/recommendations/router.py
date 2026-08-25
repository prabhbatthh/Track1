from typing import Annotated

from fastapi import APIRouter, Depends, Request
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.core.rate_limit import limiter
from app.modules.recommendations import service
from app.modules.recommendations.schemas import (
    DescribeRequest,
    QuizAnswers,
    QuizResponse,
    RecommendationResponse,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

member_only = require_role(Role.MEMBER)


@router.get("/quiz", response_model=QuizResponse)
async def get_quiz(_: Annotated[User, Depends(member_only)]) -> QuizResponse:
    return await service.build_quiz()


@router.post("/quiz", response_model=RecommendationResponse)
async def submit_quiz(
    payload: QuizAnswers,
    current_user: Annotated[User, Depends(member_only)],
) -> RecommendationResponse:
    return await service.submit_quiz(current_user.id, payload)


@router.post("/describe", response_model=RecommendationResponse)
@limiter.limit("10/minute")
async def describe(
    request: Request,
    payload: DescribeRequest,
    current_user: Annotated[User, Depends(member_only)],
) -> RecommendationResponse:
    return await service.describe_and_recommend(current_user.id, payload.description)
