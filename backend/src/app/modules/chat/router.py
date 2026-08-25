from typing import Annotated

from fastapi import APIRouter, Depends, Request
from prisma.models import User

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.modules.chat import history as chat_history
from app.modules.chat.orchestrator import run_chat
from app.modules.chat.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(
    request: Request,
    payload: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ChatResponse:
    history = await chat_history.load_history(current_user.id)

    response = await run_chat(
        message=payload.message,
        history=history,
        member_id=current_user.id,
        user_name=current_user.fullName,
        role=current_user.role.name,
    )

    if response.source != "error":
        await chat_history.append_turn(current_user.id, payload.message, response.reply)

    return response


@router.delete("/history", status_code=204)
async def clear_chat_history(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await chat_history.clear_history(current_user.id)
