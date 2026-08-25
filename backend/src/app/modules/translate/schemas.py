from pydantic import BaseModel, Field, field_validator


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    target_lang: str = Field(min_length=2, max_length=10)
    source_lang: str = "auto"


class TranslateResponse(BaseModel):
    translated: str


# Sized to fit one complete UI locale in a single request. en.json currently flattens
# to ~1600 strings / ~40k characters, and the old 100-item / 20k-character caps meant
# every auto-translated language 422'd on its first and only attempt — the whole
# feature was dead for the ten languages without a static locale file. Chunking on the
# client was the alternative, but ~16 requests collides with this endpoint's 10/minute
# limit, so the batch is what gives.
MAX_BATCH_ITEMS = 2500
MAX_BATCH_CHARACTERS = 60_000
MAX_TEXT_CHARACTERS = 5000


class TranslateBatchRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_BATCH_ITEMS)
    target_lang: str = Field(min_length=2, max_length=10)
    source_lang: str = "auto"

    @field_validator("texts")
    @classmethod
    def _validate_total_size(cls, texts: list[str]) -> list[str]:
        if any(not text or len(text) > MAX_TEXT_CHARACTERS for text in texts):
            raise ValueError(
                f"Each text must contain between 1 and {MAX_TEXT_CHARACTERS} characters"
            )
        if sum(len(text) for text in texts) > MAX_BATCH_CHARACTERS:
            raise ValueError(f"Batch text is limited to {MAX_BATCH_CHARACTERS} characters")
        return texts


class TranslateBatchResponse(BaseModel):
    translated: list[str]
