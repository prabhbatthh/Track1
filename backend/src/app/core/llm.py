"""Shared chat/embedding-model factories for every feature that calls the configured LLM
backend.

LLM_MODE (set in .env):
  openai  -> ChatOpenAI (gpt-4o-mini or OPENAI_MODEL) / OpenAIEmbeddings
  bedrock -> ChatBedrockConverse (amazon.nova-lite-v1:0 or BEDROCK_MODEL_ID) / BedrockEmbeddings
  ollama  -> ChatOllama (llama3.2:3b or OLLAMA_MODEL) / OllamaEmbeddings

Pulled out of chat/orchestrator.py once a second feature (books/service.py's
suggest_description) needed the same provider-selection logic — one place to add a
provider or change a default, instead of two copies drifting apart.
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from pydantic import SecretStr

from app.core.config import get_settings


def build_chat_llm() -> BaseChatModel:
    s = get_settings()
    mode = s.llm_mode.lower()

    if mode == "bedrock":
        from langchain_aws import ChatBedrockConverse

        kwargs: dict[str, Any] = {"model_id": s.bedrock_model_id, "region_name": s.aws_region}
        if s.aws_access_key_id and s.aws_secret_access_key:
            kwargs["aws_access_key_id"] = s.aws_access_key_id
            kwargs["aws_secret_access_key"] = s.aws_secret_access_key
        return ChatBedrockConverse(**kwargs)

    if mode == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(model=s.ollama_model, base_url=s.ollama_base_url)

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=s.openai_model,
        api_key=SecretStr(s.openai_api_key),
        temperature=0.3,
    )


def build_embeddings() -> Embeddings:
    """Same LLM_MODE branch as build_chat_llm(), for the one feature (book similarity)
    that needs vectors instead of text. Kept as a separate factory rather than a second
    branch inside build_chat_llm() — a chat model and an embedding model are different
    LangChain interfaces, and callers need to pick the right one, not get one implicitly.
    """
    s = get_settings()
    mode = s.llm_mode.lower()

    if mode == "bedrock":
        from langchain_aws import BedrockEmbeddings

        kwargs: dict[str, Any] = {
            "model_id": s.bedrock_embedding_model_id,
            "region_name": s.aws_region,
        }
        if s.aws_access_key_id and s.aws_secret_access_key:
            kwargs["aws_access_key_id"] = s.aws_access_key_id
            kwargs["aws_secret_access_key"] = s.aws_secret_access_key
        return BedrockEmbeddings(**kwargs)

    if mode == "ollama":
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(model=s.ollama_embedding_model, base_url=s.ollama_base_url)

    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=s.openai_embedding_model, api_key=SecretStr(s.openai_api_key))


def extract_json_object(text: str) -> dict[str, Any] | None:
    """Small local models sometimes wrap a requested JSON reply in a markdown code
    fence despite being told not to — strip one if present before parsing. Shared by
    every feature that asks the model for structured output instead of prose
    (recommendations' describe-to-quiz, books' cover identification).
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None
