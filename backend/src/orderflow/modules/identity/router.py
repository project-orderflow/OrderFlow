from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.modules.identity.dependencies import get_current_user
from orderflow.modules.identity.models import User
from orderflow.modules.identity.schemas import (
    CurrentUserResponse,
    LoginRequest,
    RefreshRequest,
    TokenPairResponse,
)
from orderflow.modules.identity.service import (
    authenticate_and_issue_tokens,
    get_user_from_access_token,
    refresh_token_pair,
)
from orderflow.shared.db.session import get_db_session


router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user_info(
    user: User = Depends(get_current_user),
) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        role=user.role.name,
    )
