from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Development-only fallback; the validator below rejects it in production.
DEFAULT_JWT_SECRET = "dev-secret-change-me-32-bytes-minimum"  # nosec B105
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    app_name: str = "MAY2026 Team 041 API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    # Apply pending migrations at startup so a freshly pulled branch just runs. Prisma's
    # `migrate deploy` is idempotent and takes a database-level advisory lock, so several
    # replicas booting at once is safe. Set AUTO_MIGRATE=false if your deployment applies
    # migrations as its own step and the app should never touch the schema.
    auto_migrate: bool = Field(default=True, validation_alias="AUTO_MIGRATE")
    # Runs scripts/seed_books.py + scripts/seed_demo_data.py on startup in development
    # only, so a fresh clone has books and ~5 months of demo activity without anyone
    # remembering to run the seed scripts by hand. Both are idempotent, so repeat boots
    # (including --reload restarts) just skip after the first. Set AUTO_SEED_DEMO=false
    # to opt out.
    auto_seed_demo: bool = Field(default=True, validation_alias="AUTO_SEED_DEMO")
    database_url: str = Field(
        default="postgresql://app:app@localhost:5432/app",
        validation_alias="DATABASE_URL",
    )
    backend_cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    jwt_secret: str = Field(default=DEFAULT_JWT_SECRET, validation_alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
    # Left blank in dev — order creation 503s until test-mode keys from the Razorpay
    # dashboard (Settings > API Keys) are set. key_secret never leaves the backend.
    razorpay_key_id: str = Field(default="", validation_alias="RAZORPAY_KEY_ID")
    razorpay_key_secret: str = Field(default="", validation_alias="RAZORPAY_KEY_SECRET")
    # Redis (chat history)
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    chat_history_ttl_seconds: int = Field(default=3600, validation_alias="CHAT_HISTORY_TTL_SECONDS")
    chat_history_max_turns: int = Field(default=5, validation_alias="CHAT_HISTORY_MAX_TURNS")
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", validation_alias="OPENAI_MODEL")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small", validation_alias="OPENAI_EMBEDDING_MODEL"
    )
    # LLM backend: "openai" | "bedrock" | "ollama"
    # Defaults to ollama to match .env.example: a missing LLM_MODE then falls back to the
    # free local model rather than silently reaching for a paid API, which is what happened
    # when this defaulted to "openai" while the template said otherwise.
    llm_mode: str = Field(default="ollama", validation_alias="LLM_MODE")
    # AWS Bedrock
    aws_region: str = Field(default="us-east-1", validation_alias="AWS_REGION")
    aws_access_key_id: str = Field(default="", validation_alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str = Field(default="", validation_alias="AWS_SECRET_ACCESS_KEY")
    bedrock_model_id: str = Field(
        default="amazon.nova-lite-v1:0", validation_alias="BEDROCK_MODEL_ID"
    )
    bedrock_embedding_model_id: str = Field(
        default="amazon.titan-embed-text-v2:0", validation_alias="BEDROCK_EMBEDDING_MODEL_ID"
    )
    # Ollama
    ollama_base_url: str = Field(
        default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL"
    )
    ollama_model: str = Field(default="llama3.2:3b", validation_alias="OLLAMA_MODEL")
    # Separate embedding model, since a chat model like llama3.2 isn't tuned for it —
    # nomic-embed-text is a small, widely-available Ollama embedding model. Pull it with
    # `ollama pull nomic-embed-text`; ensure_embedding() logs and skips per-book if it's
    # not present rather than failing the request.
    ollama_embedding_model: str = Field(
        default="nomic-embed-text", validation_alias="OLLAMA_EMBEDDING_MODEL"
    )
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    reset_token_expire_minutes: int = 30
    frontend_url: str = Field(default="http://localhost:5173", validation_alias="FRONTEND_URL")

    # Left blank in dev — mail.py logs to console instead of sending when smtp_host is unset.
    smtp_host: str = Field(default="", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_password: str = Field(default="", validation_alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="", validation_alias="SMTP_FROM")
    smtp_use_tls: bool = Field(default=True, validation_alias="SMTP_USE_TLS")

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def _check_jwt_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and (
            self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < MIN_JWT_SECRET_LENGTH
        ):
            raise ValueError(
                "JWT_SECRET must be set to a unique value of at least "
                f"{MIN_JWT_SECRET_LENGTH} characters in production."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
