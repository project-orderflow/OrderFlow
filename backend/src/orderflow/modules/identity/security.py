import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from orderflow.shared.config import get_settings


password_hasher = PasswordHash.recommended()
settings = get_settings()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return password_hasher.verify(password, hashed_password)
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    token, _ = _create_token(
        user_id=user_id,
        token_type="access",
        lifetime=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return token


def create_refresh_token(user_id: int) -> tuple[str, datetime]:
    return _create_token(
        user_id=user_id,
        token_type="refresh",
        lifetime=timedelta(days=settings.refresh_token_expire_days),
    )


def get_token_subject(token: str, expected_token_type: str) -> int | None:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
    except InvalidTokenError:
        return None

    if payload.get("type") != expected_token_type:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.isdigit():
        return None

    return int(subject)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_token(
    *,
    user_id: int,
    token_type: str,
    lifetime: timedelta,
) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + lifetime
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "jti": str(uuid4()),
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_at
