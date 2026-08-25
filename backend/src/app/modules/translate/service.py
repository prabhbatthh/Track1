import asyncio
import hashlib

import anyio
from deep_translator import GoogleTranslator
from deep_translator.exceptions import LanguageNotSupportedException, NotValidPayload
from fastapi import HTTPException, status

from app.modules.translate.schemas import (
    TranslateBatchRequest,
    TranslateBatchResponse,
    TranslateRequest,
    TranslateResponse,
)

# Caps how many translate calls run at once so we don't hammer Google's free
# endpoint (which has no official rate limit guarantee) when a batch is large.
_BATCH_CONCURRENCY = 16

# In-memory cache so a given (source, target, text-list) batch — e.g. the full
# UI string set for one language — is only ever translated once per process
# lifetime, no matter how many users trigger it.
#
# Bounded: the key is a hash of caller-supplied text on an unauthenticated endpoint, so
# an unbounded dict grew by every distinct payload and was never reclaimed. Insertion
# order gives us FIFO eviction for free.
# ponytail: FIFO, not LRU — the real workload is a handful of full-locale batches, so
# tracking recency would cost more than it saves. Swap in an LRU if the hit rate drops.
_BATCH_CACHE_MAX_ENTRIES = 64
_batch_cache: dict[str, list[str]] = {}


def _translate_one(text: str, source_lang: str, target_lang: str) -> str:
    # A fresh instance per call: GoogleTranslator.translate() mutates a shared
    # _url_params dict on self, so reusing one instance across concurrent
    # threads can race and return a translation for the wrong text.
    return GoogleTranslator(source=source_lang, target=target_lang).translate(text)


async def translate_text(payload: TranslateRequest) -> TranslateResponse:
    try:
        translated = await anyio.to_thread.run_sync(
            _translate_one, payload.text, payload.source_lang, payload.target_lang
        )
    except (LanguageNotSupportedException, NotValidPayload) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Translation service unavailable"
        ) from exc

    return TranslateResponse(translated=translated)


def _batch_cache_key(texts: list[str], source_lang: str, target_lang: str) -> str:
    joined = "\x1f".join(texts)
    return hashlib.sha256(f"{source_lang}|{target_lang}|{joined}".encode()).hexdigest()


async def translate_batch(payload: TranslateBatchRequest) -> TranslateBatchResponse:
    cache_key = _batch_cache_key(payload.texts, payload.source_lang, payload.target_lang)
    cached = _batch_cache.get(cache_key)
    if cached is not None:
        return TranslateBatchResponse(translated=cached)

    semaphore = asyncio.Semaphore(_BATCH_CONCURRENCY)

    async def translate_one(text: str) -> str:
        if not text.strip():
            return text
        async with semaphore:
            return await anyio.to_thread.run_sync(
                _translate_one, text, payload.source_lang, payload.target_lang
            )

    try:
        translated = await asyncio.gather(*(translate_one(t) for t in payload.texts))
    except (LanguageNotSupportedException, NotValidPayload) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Translation service unavailable"
        ) from exc

    if len(_batch_cache) >= _BATCH_CACHE_MAX_ENTRIES:
        del _batch_cache[next(iter(_batch_cache))]
    _batch_cache[cache_key] = translated
    return TranslateBatchResponse(translated=translated)
