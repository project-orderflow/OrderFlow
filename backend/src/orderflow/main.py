from fastapi import FastAPI

from orderflow.modules.catalog.router import router as catalog_router
from orderflow.modules.identity.router import router as auth_router
from orderflow.shared.config import get_settings


settings = get_settings()

app = FastAPI(
  title="OrderFlow API",
  version="0.1.0",
)

app.include_router(auth_router)
app.include_router(catalog_router)

@app.get("/")
async def root() -> dict[str, str]:
  return {
    "message": "OrderFlow API",
    "enviroment": settings.environment,
  }


@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


@app.get("/api/v1/system/info")
async def system_info() -> dict[str, str]:
  return {
    "name": settings.app_name,
    "version": app.version,
    "environment": settings.environment,
  }
