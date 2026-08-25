from pydantic import BaseModel, EmailStr, Field

from app.modules.members.schemas import MemberOut


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    role: str | None = Field(default=None, max_length=50)
    avatar_url: str | None = Field(default=None, max_length=500)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    password: str | None = Field(default=None, min_length=8)
    # Required whenever `password` is set — see auth.service.update_profile. Without it
    # a stolen access token was enough to change the password and lock the owner out.
    current_password: str | None = None
    avatar_url: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: MemberOut
    is_new_user: bool = False
