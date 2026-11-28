from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from orderflow.modules.identity.models import RefreshToken, Role, User
from orderflow.modules.identity.security import (
    create_access_token,
    create_refresh_token,
    get_token_subject,
    hash_password,
    hash_refresh_token,
    verify_password,
)


async def register_operator(
    session: AsyncSession,
    name: str,
    email: str,
    password: str,
) -> int | None:
    hashed_password = await run_in_threadpool(hash_password, password)
    operator_role_id = select(Role.id).where(Role.name == "OPERATOR").scalar_subquery()
    statement = (
        insert(User)
        .values(name=name, email=email, hashed_password=hashed_password, role_id=operator_role_id)
        .on_conflict_do_nothing(index_elements=[User.email])
        .returning(User.id)
    )
    user_id = await session.scalar(statement)
    await session.commit()
    return user_id


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


async def change_password(
    session: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> bool:
    current_hash = user.hashed_password
    if not await run_in_threadpool(verify_password, current_password, current_hash):
        return False

    new_hash = await run_in_threadpool(hash_password, new_password)
    changed_user_id = await session.scalar(
        update(User)
        .where(User.id == user.id, User.is_active, User.hashed_password == current_hash)
        .values(hashed_password=new_hash)
        .returning(User.id)
    )
    await session.commit()
    return changed_user_id is not None


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
