"""
Feedback router — human-in-the-loop signal.

Routes:
  POST /api/feedback
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter

from models import FeedbackRequest, FeedbackResponse

router = APIRouter(prefix="/api", tags=["feedback"])

# In-memory store (replace with DB later)
_feedback: list[dict] = []


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest) -> FeedbackResponse:
    """Record user feedback (thumbs up/down + optional comment) on an assistant message."""
    feedback_id = str(uuid4())
    _feedback.append({"feedback_id": feedback_id, **req.model_dump()})
    return FeedbackResponse(feedback_id=feedback_id)
