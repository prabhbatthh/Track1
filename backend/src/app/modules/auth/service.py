from datetime import UTC, datetime

import jwt
from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from prisma.errors import UniqueViolationError
from prisma.models import User

from app.core.config import get_settings
from app.core.constants import Role
from app.core.mail import send_email_async
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
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
from app.modules.loans import service as loans_service
from app.modules.members import repository
from app.modules.members.schemas import MemberOut

InvalidCredentials = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
)
InvalidRefreshToken = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
)
InvalidResetToken = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link"
)


async def register(payload: RegisterRequest) -> TokenResponse:
    target_role_str = (payload.role or Role.MEMBER.value).lower()
    if target_role_str not in (Role.MEMBER.value, Role.GUARDIAN.value):
        target_role_str = Role.MEMBER.value

    role = await repository.upsert_role(target_role_str)

    try:
        user = await repository.create_member(
            email=payload.email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            phone=payload.phone,
            avatar_url=payload.avatar_url,
            role_id=role.id,
        )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from exc

    await repository.touch_last_login(user.id)
    return _issue_token(user)


async def login(payload: LoginRequest) -> TokenResponse:
    user = await repository.find_by_email(payload.email)
    if (
        user is None
        or user.passwordHash is None
        or not verify_password(payload.password, user.passwordHash)
    ):
        raise InvalidCredentials
    if not user.isActive or user.deletedAt is not None:
        raise InvalidCredentials

    await repository.touch_last_login(user.id)
    return _issue_token(user)


async def google_login(payload: GoogleLoginRequest) -> TokenResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured on this server",
        )

    try:
        claims = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            audience=settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token"
        ) from exc

    if not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )

    email = str(claims["email"]).strip().lower()
    user = await repository.find_by_email(email)
    is_new_user = user is None

    if user is None:
        role = await repository.upsert_role(Role.MEMBER.value)
        try:
            user = await repository.create_member(
                email=email,
                password_hash=None,
                full_name=claims.get("name") or email.split("@")[0],
                phone=None,
                avatar_url=claims.get("picture"),
                role_id=role.id,
            )
        except UniqueViolationError:
            # Another callback for the same first-time Google identity won the
            # create race. Reuse that canonical account instead of returning 500.
            user = await repository.find_by_email(email)
            if user is None:
                raise
            is_new_user = False
    elif not user.isActive or user.deletedAt is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled"
        )

    await repository.touch_last_login(user.id)
    return _issue_token(user, is_new_user=is_new_user)


async def update_profile(user: User, payload: UpdateProfileRequest) -> TokenResponse:
    fields_set = payload.model_fields_set
    data: dict = {}
    if payload.full_name is not None:
        data["fullName"] = payload.full_name
    if "phone" in fields_set:
        data["phone"] = payload.phone
    if payload.password is not None:
        # Changing an existing password requires proving you know it. Possession of a
        # 15-minute access token is not proof of identity — it can be lifted from a
        # shared machine or a borrowed session — and without this check that token
        # became a permanent takeover that also locked the real owner out, because
        # the tokenVersion bump below kills their sessions.
        #
        # A Google-created account has no hash yet: CompleteProfileModal sets its first
        # password, and there is nothing to confirm against. Only that first set is
        # exempt; every later change goes through the check.
        if user.passwordHash is not None and (
            not payload.current_password
            or not verify_password(payload.current_password, user.passwordHash)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect"
            )
        data["passwordHash"] = hash_password(payload.password)
        # Invalidate every refresh token issued before this password change in
        # the same write that stores the new password.
        data["tokenVersion"] = {"increment": 1}
    if "avatar_url" in fields_set:
        data["avatarUrl"] = payload.avatar_url

    updated = await repository.update_member(user.id, data) if data else user
    return _issue_token(updated)


async def refresh(payload: RefreshRequest) -> TokenResponse:
    try:
        claims = decode_token(payload.refresh_token)
    except jwt.InvalidTokenError as exc:
        raise InvalidRefreshToken from exc

    if claims.get("type") != "refresh":
        raise InvalidRefreshToken

    user_id = claims.get("sub")
    user = await repository.find_by_id(user_id) if user_id else None
    if user is None or not user.isActive or user.deletedAt is not None:
        raise InvalidRefreshToken

    # ver must match the user's current tokenVersion — logout() bumps it, which
    # invalidates every refresh token issued before that point in one step.
    if claims.get("ver") != user.tokenVersion:
        raise InvalidRefreshToken

    return _issue_token(user)


async def logout(user: User) -> None:
    await repository.bump_token_version(user.id)


async def delete_account(user: User) -> None:
    if user.role.name != Role.MEMBER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff accounts can't be self-deleted — contact an admin",
        )

    loans = await loans_service.list_my_loans(user.id)
    if any(loan.status != "returned" or not loan.fine_paid for loan in loans):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Return all borrowed books and clear outstanding fines before deleting "
            "your account",
        )

    await repository.update_member(user.id, {"deletedAt": datetime.now(UTC), "isActive": False})
    await repository.bump_token_version(user.id)


async def forgot_password(payload: ForgotPasswordRequest) -> None:
    user = await repository.find_by_email(payload.email)
    # ponytail: always 204 regardless of whether the account exists — don't let this
    # endpoint be used to enumerate registered emails.
    if user is None or not user.isActive or user.deletedAt is not None:
        return

    token = create_reset_token(user.id, user.tokenVersion)
    reset_link = f"{get_settings().frontend_url}/reset-password?token={token}"
    await send_email_async(
        user.email,
        "Reset your library password",
        f"Reset your password: {reset_link}\n\nThis link expires in "
        f"{get_settings().reset_token_expire_minutes} minutes. "
        "If you didn't request this, ignore it.",
    )


async def reset_password(payload: ResetPasswordRequest) -> None:
    try:
        claims = decode_token(payload.token)
    except jwt.InvalidTokenError as exc:
        raise InvalidResetToken from exc

    if claims.get("type") != "reset":
        raise InvalidResetToken

    user_id = claims.get("sub")
    user = await repository.find_by_id(user_id) if user_id else None
    if user is None or not user.isActive or user.deletedAt is not None:
        raise InvalidResetToken

    # ver must match — a used or superseded reset token, or one issued before a
    # subsequent logout/reset, is rejected the same way refresh() rejects stale tokens.
    if claims.get("ver") != user.tokenVersion:
        raise InvalidResetToken

    await repository.update_member(user.id, {"passwordHash": hash_password(payload.password)})
    # Bump tokenVersion so the reset token (and every existing session) is invalidated.
    await repository.bump_token_version(user.id)


def _issue_token(user: User, *, is_new_user: bool = False) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id, user.tokenVersion),
        user=MemberOut.from_prisma(user),
        is_new_user=is_new_user,
    )
