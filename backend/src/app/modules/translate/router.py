from fastapi import APIRouter, Request

from app.core.rate_limit import limiter
from app.modules.translate import service
from app.modules.translate.schemas import (
    TranslateBatchRequest,
    TranslateBatchResponse,
    TranslateRequest,
    TranslateResponse,
)

router = APIRouter(prefix="/translate", tags=["translate"])


@router.post("", response_model=TranslateResponse)
@limiter.limit("30/minute")
async def translate(
    request: Request,
    payload: TranslateRequest,
) -> TranslateResponse:
    return await service.translate_text(payload)


@router.post("/batch", response_model=TranslateBatchResponse)
@limiter.limit("10/minute")
async def translate_batch(
    request: Request,
    payload: TranslateBatchRequest,
) -> TranslateBatchResponse:
    return await service.translate_batch(payload)
