from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from prisma.models import User

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.modules.auth import service
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, payload: RegisterRequest) -> TokenResponse:
    return await service.register(payload)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest) -> TokenResponse:
    return await service.login(payload)


@router.post("/google", response_model=TokenResponse)
@limiter.limit("5/minute")
async def google(request: Request, payload: GoogleLoginRequest) -> TokenResponse:
    return await service.google_login(payload)


@router.patch("/me", response_model=TokenResponse)
@limiter.limit("10/minute")
async def update_profile(
    request: Request,
    payload: UpdateProfileRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> TokenResponse:
    return await service.update_profile(user, payload)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh(request: Request, payload: RefreshRequest) -> TokenResponse:
    return await service.refresh(payload)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.logout(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.delete_account(user)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest) -> None:
    await service.forgot_password(payload)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest) -> None:
    await service.reset_password(payload)
