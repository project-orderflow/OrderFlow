from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_name: str = "OrderFlow"
  environment: str = "development"

  database_url: str
  jwt_secret_key: SecretStr
  jwt_algorithm: str = "HS256"
  access_token_expire_minutes: int = 30
  refresh_token_expire_days: int = 7

  woocommerce_base_url: str | None = None
  woocommerce_consumer_key: SecretStr | None = None
  woocommerce_consumer_secret: SecretStr | None = None
  woocommerce_webhook_secret: SecretStr | None = None

  model_config = SettingsConfigDict(
    env_file="../.env",
    env_file_encoding="utf-8",
    extra="ignore",
  )


@lru_cache
def get_settings() -> Settings:
  return Settings()
