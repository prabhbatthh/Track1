from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.modules.translate import service
from app.modules.translate.schemas import (
    MAX_BATCH_CHARACTERS,
    MAX_TEXT_CHARACTERS,
    TranslateBatchResponse,
)


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as test_client:
        yield test_client


async def test_single_translation_is_public_but_bounded(client, monkeypatch):
    monkeypatch.setattr(service, "translate_text", AsyncMock(return_value={"translated": "नमस्ते"}))

    response = await client.post("/api/v1/translate", json={"text": "Hello", "target_lang": "hi"})

    assert response.status_code == 200
    assert response.json() == {"translated": "नमस्ते"}


async def test_translation_rejects_oversized_text_without_calling_upstream(client, monkeypatch):
    upstream = AsyncMock()
    monkeypatch.setattr(service, "translate_text", upstream)

    response = await client.post(
        "/api/v1/translate", json={"text": "x" * 5001, "target_lang": "hi"}
    )

    assert response.status_code == 422
    upstream.assert_not_awaited()


async def test_batch_translation_rejects_excessive_total_size(client, monkeypatch):
    """The cap is sized to fit one full UI locale; anything beyond it is still refused."""
    upstream = AsyncMock()
    monkeypatch.setattr(service, "translate_batch", upstream)

    over_the_limit = (MAX_BATCH_CHARACTERS // MAX_TEXT_CHARACTERS) + 1
    response = await client.post(
        "/api/v1/translate/batch",
        json={"texts": ["x" * MAX_TEXT_CHARACTERS] * over_the_limit, "target_lang": "hi"},
    )

    assert response.status_code == 422
    upstream.assert_not_awaited()


async def test_batch_translation_accepts_a_full_locale_sized_payload(client, monkeypatch):
    """en.json flattens to ~1600 strings — the old 100-item cap made every
    auto-translated language fail on its only attempt."""
    upstream = AsyncMock(return_value=TranslateBatchResponse(translated=["ok"] * 1600))
    monkeypatch.setattr(service, "translate_batch", upstream)

    response = await client.post(
        "/api/v1/translate/batch",
        json={"texts": ["short string"] * 1600, "target_lang": "ta"},
    )

    assert response.status_code == 200
    upstream.assert_awaited_once()
