from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.modules.identity.dependencies import get_current_user
from orderflow.modules.identity.models import User
from orderflow.modules.identity.schemas import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    RegisteredUserResponse,
    TokenPairResponse,
    UpdateProfileRequest,
)
from orderflow.modules.identity.service import (
    authenticate_and_issue_tokens,
    change_password,
    refresh_token_pair,
    register_operator,
)
from orderflow.shared.db.session import get_db_session


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=RegisteredUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RegisteredUserResponse:
    user_id = await register_operator(session, payload.name, payload.email, payload.password)
    if user_id is None:
        raise HTTPException(status_code=409, detail="Email already registered")
    return RegisteredUserResponse(id=user_id, email=payload.email)


@router.post("/login", response_model=TokenPairResponse)
async def login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenPairResponse:
    token_pair = await authenticate_and_issue_tokens(
        session,
        payload.email,
        payload.password,
    )
    if token_pair is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token, refresh_token = token_pair
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenPairResponse:
    token_pair = await refresh_token_pair(session, payload.refresh_token)
    if token_pair is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access_token, refresh_token = token_pair
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.get("/me", response_model=CurrentUserResponse, response_model_exclude_none=True)
async def get_current_user_info(
    user: User = Depends(get_current_user),
) -> CurrentUserResponse:
    return _current_user_response(user)


@router.patch("/me", response_model=CurrentUserResponse)
async def update_current_user_info(
    payload: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> CurrentUserResponse:
    user.name = payload.name
    await session.commit()
    return _current_user_response(user)


@router.patch("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def update_current_user_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    changed = await change_password(session, user, payload.current_password, payload.new_password)
    if not changed:
        raise HTTPException(status_code=400, detail="Current password is incorrect")


def _current_user_response(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.name,
    )
