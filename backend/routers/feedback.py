"""
Feedback router — human-in-the-loop signal.

Routes:
  POST /api/feedback

Thumbs-down feedback with a comment is automatically persisted to long-term
memory as a 'correction' entry so future sessions benefit from the correction.
"""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter

from models import FeedbackRequest, FeedbackResponse
from src import memory as agent_memory

router = APIRouter(prefix="/api", tags=["feedback"])
logger = logging.getLogger(__name__)

# In-memory store (persist raw feedback for audit)
_feedback: list[dict] = []


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest) -> FeedbackResponse:
    """Record user feedback (thumbs up/down + optional comment) on an assistant message."""
    feedback_id = str(uuid4())
    _feedback.append({"feedback_id": feedback_id, **req.model_dump()})

    # Persist negative feedback with a comment as a correction memory
    if req.rating == "thumbs_down" and req.comment and req.comment.strip():
        try:
            context = f"session={req.session_id} message={req.message_id}"
            agent_memory.save_correction(context, req.comment.strip())
            logger.info("[feedback] correction saved to memory: %s", req.comment[:80])
        except Exception as e:
            logger.warning("[feedback] failed to save correction to memory: %s", e)

    return FeedbackResponse(feedback_id=feedback_id)
