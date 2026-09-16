from fastapi import FastAPI

from orderflow.shared.config import get_settings


settings = get_settings()

app = FastAPI(
  title="OrderFlow API",
  version="0.1.0",
)

@app.get("/")
async def root() -> dict[str, str]:
  return {
    "message": "OrderFlow API",
    "enviroment": settings.environment,
  }