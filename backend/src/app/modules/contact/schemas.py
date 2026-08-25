from pydantic import BaseModel, EmailStr, Field

PHONE_PATTERN = r"^\+?[\d\s()-]{7,20}$"


class ContactMessageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    phone_number: str = Field(pattern=PHONE_PATTERN)
    organization: str = Field(min_length=1, max_length=150)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=10, max_length=5000)
