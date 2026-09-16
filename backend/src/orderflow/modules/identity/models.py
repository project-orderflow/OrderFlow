from sqlalchemy import Boolean, ForeignKey, String, true
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