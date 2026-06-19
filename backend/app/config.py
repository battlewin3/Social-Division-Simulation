"""Application configuration."""

import os


class Settings:
    APP_NAME: str = "社会模拟 ABM API"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL", "300"))  # 5 minutes
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")


settings = Settings()
