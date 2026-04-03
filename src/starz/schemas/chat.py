from pydantic import BaseModel


class ChatMessage(BaseModel):
    """A single chat message."""

    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Chat request with optional history."""

    query: str
    history: list[ChatMessage] = []


class ChatSource(BaseModel):
    """A repo cited in the chat response."""

    full_name: str
    html_url: str
    category: str | None = None
    summary: str | None = None


class ChatResponse(BaseModel):
    """Chat response with answer and sources."""

    answer: str
    sources: list[ChatSource]
