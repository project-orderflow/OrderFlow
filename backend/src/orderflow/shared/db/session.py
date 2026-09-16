from sqlalchemy.ext.asyncio import (
  AsyncSession,
  async_sessionmaker,
  create_async_engine,
)

from collections.abc import AsyncGenerator


from orderflow.shared.config import get_settings

settings = get_settings()

engine = create_async_engine(
  settings.database_url,
  echo=False,
)

SessionFactory = async_sessionmaker(
  bind=engine,
  class_=AsyncSession,
  expire_on_commit=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
  async with SessionFactory() as session:
    yield session
    

