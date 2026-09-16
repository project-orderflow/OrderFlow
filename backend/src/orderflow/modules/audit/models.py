from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from orderflow.shared.db.base import Base

class AuditEvent(Base):
  __tablename__ = "audit_events"
  
  id: Mapped[int] = mapped_column(primary_key=True)
  
  event_type: Mapped[str] = mapped_column(
    String(100),
    nullable=False,
  )
  
  entity_type: Mapped[str] = mapped_column(
      String(100),
      nullable=False,
  )

  entity_id: Mapped[str | None] = mapped_column(
      String(100),
      nullable=True,
  )

  created_at: Mapped[datetime] = mapped_column(
      DateTime(timezone=True),
      server_default=func.now(),
      nullable=False,
  )