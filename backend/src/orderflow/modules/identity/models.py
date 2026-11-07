from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from orderflow.shared.db.base import Base


class Role(Base):
  __tablename__ = "roles"
  
  id: Mapped[int] = mapped_column(primary_key=True)
  name: Mapped[str] = mapped_column(
    String(50),
    unique=True,
    nullable=False,
  )
  
  users: Mapped[list["User"]] = relationship(
    back_populates="role"
  )
  
class User(Base):
  __tablename__ = "users"

  id: Mapped[int] = mapped_column(primary_key=True)

  email: Mapped[str] = mapped_column(
      String(255),
      unique=True,
      nullable=False,
      index=True,
  )

  hashed_password: Mapped[str] = mapped_column(
      String(255),
      nullable=False,
  )

  is_active: Mapped[bool] = mapped_column(
      Boolean,
      default=True,
      server_default=true(),
      nullable=False,
  )

  role_id: Mapped[int] = mapped_column(
      ForeignKey("roles.id"),
      nullable=False,
  )

  role: Mapped["Role"] = relationship(
      back_populates="users"
  )

  refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
      back_populates="user"
  )


class RefreshToken(Base):
  __tablename__ = "refresh_tokens"

  id: Mapped[int] = mapped_column(primary_key=True)

  user_id: Mapped[int] = mapped_column(
      ForeignKey("users.id"),
      nullable=False,
      index=True,
  )

  token_hash: Mapped[str] = mapped_column(
      String(64),
      unique=True,
      nullable=False,
  )

  expires_at: Mapped[datetime] = mapped_column(
      DateTime(timezone=True),
      nullable=False,
  )

  revoked_at: Mapped[datetime | None] = mapped_column(
      DateTime(timezone=True),
      nullable=True,
  )

  created_at: Mapped[datetime] = mapped_column(
      DateTime(timezone=True),
      server_default=func.now(),
      nullable=False,
  )

  user: Mapped["User"] = relationship(
      back_populates="refresh_tokens"
  )
