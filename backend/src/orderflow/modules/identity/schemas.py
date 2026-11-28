from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[^\x00]+$"),
]
NewPassword = Annotated[str, Field(min_length=12, max_length=128)]


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: DisplayName


class RegisterRequest(UpdateProfileRequest):
    email: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            max_length=255,
            pattern=r"^[^@\s\x00]+@[^@\s\x00]+\.[^@\s\x00]+$",
        ),
    ]
    password: NewPassword


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=128)
    new_password: NewPassword


class RegisteredUserResponse(BaseModel):
    id: int
    email: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class CurrentUserResponse(RegisteredUserResponse):
    name: str | None = None
    role: str
