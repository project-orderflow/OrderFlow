from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from orderflow.modules.identity.models import RefreshToken, User
from orderflow.modules.identity.security import (
    create_access_token,
    create_refresh_token,
    get_token_subject,
    hash_refresh_token,
    verify_password,
)


async def authenticate_and_issue_tokens(
    session: AsyncSession,
    email: str,
    password: str,
) -> tuple[str, str] | None:
    user = await session.scalar(
        select(User).where(User.email == email)
    )
    if user is None or not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return await _issue_token_pair(session, user)


async def refresh_token_pair(
    session: AsyncSession,
    raw_refresh_token: str,
) -> tuple[str, str] | None:
    user_id = get_token_subject(raw_refresh_token, "refresh")
    if user_id is None:
        return None

    token_hash = hash_refresh_token(raw_refresh_token)
    refresh_token = await session.scalar(
        select(RefreshToken)
        .options(selectinload(RefreshToken.user))
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    if (
        refresh_token is None
        or refresh_token.user_id != user_id
        or refresh_token.revoked_at is not None
        or refresh_token.expires_at <= now
        or not refresh_token.user.is_active
    ):
        return None

    refresh_token.revoked_at = now
    return await _issue_token_pair(session, refresh_token.user)


async def get_user_from_access_token(
    session: AsyncSession,
    raw_access_token: str,
) -> User | None:
    user_id = get_token_subject(raw_access_token, "access")
    if user_id is None:
        return None

    user = await session.scalar(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id)
    )
    if user is None or not user.is_active:
        return None

    return user


async def _issue_token_pair(
    session: AsyncSession,
    user: User,
) -> tuple[str, str]:
    access_token = create_access_token(user.id)
    refresh_token, expires_at = create_refresh_token(user.id)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=expires_at,
        )
    )
    await session.commit()
    return access_token, refresh_token
