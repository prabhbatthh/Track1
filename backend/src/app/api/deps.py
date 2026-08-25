from collections.abc import Callable, Coroutine
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from prisma.models import User

from app.core.security import decode_token
from app.db.prisma import prisma

bearer_scheme = HTTPBearer(auto_error=False)

CredentialsError = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise CredentialsError

    try:
        payload = decode_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        raise CredentialsError from exc

    if payload.get("type") != "access":
        raise CredentialsError

    user_id = payload.get("sub")
    if not user_id:
        raise CredentialsError

    user = await prisma.user.find_unique(where={"id": user_id}, include={"role": True})
    if user is None or user.deletedAt is not None or not user.isActive:
        raise CredentialsError

    return user


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await prisma.user.find_unique(where={"id": user_id}, include={"role": True})
    if user is None or user.deletedAt is not None or not user.isActive:
        return None
    return user


def require_role(*allowed_roles: str) -> Callable[..., Coroutine[Any, Any, User]]:
    async def dependency(
        user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if user.role.name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return dependency
