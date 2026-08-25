import pytest
from pydantic import ValidationError

from app.modules.chat.schemas import ChatRequest


def test_chat_message_has_sane_size_bounds():
    assert ChatRequest(message="Hello").message == "Hello"
    with pytest.raises(ValidationError):
        ChatRequest(message="")
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 2001)
