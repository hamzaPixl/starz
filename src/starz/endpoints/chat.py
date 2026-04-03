"""Chat endpoint: RAG chat with starred repos."""

from fastapi import APIRouter

from starz.schemas.chat import ChatRequest, ChatResponse, ChatSource
from starz.services.chat import chat as do_chat

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    """RAG chat with your starred repos."""
    history = (
        [{"role": m.role, "content": m.content} for m in req.history]
        if req.history
        else None
    )
    result = do_chat(req.query, history=history)

    return ChatResponse(
        answer=result["answer"],
        sources=[ChatSource(**s) for s in result["sources"]],
    )
