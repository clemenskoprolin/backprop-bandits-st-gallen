"""
Chat router — core frontend/backend interface.

Routes:
  POST /api/chat/stream  — SSE stream: NL query → live LLM events
  POST /api/chat         — non-streaming fallback (same shape, blocks until done)
  GET  /api/sessions     — list recent sessions + data schema
  GET  /api/sessions/{session_id}  — full session with message history
  DELETE /api/sessions/{session_id}
"""

from __future__ import annotations

import asyncio
import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models import (
    ChatRequest,
    ChatResponse,
    DatasetSchema,
    Message,
    SchemaField,
    Session,
    SessionListResponse,
    SessionSummary,
    VisualizationBlock,
)

router = APIRouter(prefix="/api", tags=["chat"])

# ---------------------------------------------------------------------------
# In-memory stub store (replace with DB later)
# ---------------------------------------------------------------------------

_sessions: dict[str, Session] = {}

STUB_SCHEMA = DatasetSchema(
    tables={
        "test_results": [
            SchemaField(name="sample_id", type="string", description="Unique sample identifier"),
            SchemaField(name="material", type="string", description="Material name / grade"),
            SchemaField(name="batch_id", type="string", description="Production batch"),
            SchemaField(name="test_type", type="string", description="E.g. tensile, fatigue, hardness"),
            SchemaField(name="tensile_strength", type="float", description="MPa"),
            SchemaField(name="yield_strength", type="float", description="MPa"),
            SchemaField(name="elongation", type="float", description="Percent"),
            SchemaField(name="hardness", type="float", description="HRC"),
            SchemaField(name="test_date", type="datetime", description="ISO8601 timestamp"),
            SchemaField(name="operator", type="string", description="Lab technician ID"),
        ]
    }
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_or_create_session(session_id: str | None) -> Session:
    if session_id and session_id in _sessions:
        return _sessions[session_id]
    new_session = Session(session_id=str(uuid4()))
    _sessions[new_session.session_id] = new_session
    return new_session


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# POST /api/chat/stream  — SSE primary endpoint
# ---------------------------------------------------------------------------


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """
    Server-Sent Events stream.

    The client receives a sequence of typed events:
      session    → { session_id, message_id }
      thinking   → { step: str }          (one or more)
      query      → { query_used: str }
      text       → { chunk: str }          (one or more)
      visualization → { type, data }
      followups  → { suggestions: [str] }
      done       → {}
    """
    session = _get_or_create_session(req.session_id)
    message_id = str(uuid4())

    # Record user message
    session.messages.append(Message(role="user", content=req.message))

    async def event_generator():
        # 1. Identify session
        yield _sse_event("session", {"session_id": session.session_id, "message_id": message_id})

        # 2. Thinking steps (stub)
        thinking_steps = [
            "Parsing your question...",
            "Searching relevant test result columns...",
            "Building query...",
        ]
        for step in thinking_steps:
            await asyncio.sleep(0.05)  # simulate LLM latency
            yield _sse_event("thinking", {"step": step})

        # 3. Query used (stub)
        query = "SELECT material, AVG(tensile_strength), STDDEV(tensile_strength) FROM test_results GROUP BY material"
        await asyncio.sleep(0.05)
        yield _sse_event("query", {"query_used": query})

        # 4. Text response (chunked stub)
        text_chunks = [
            "Based on the available test data, ",
            "here is a summary of tensile strength by material. ",
            "This is a stub response — connect your LLM and data layer to populate real results.",
        ]
        full_text = ""
        for chunk in text_chunks:
            await asyncio.sleep(0.05)
            full_text += chunk
            yield _sse_event("text", {"chunk": chunk})

        # 5. Visualization (stub bar chart)
        visualization = VisualizationBlock(
            type="chart",
            data={
                "chart_type": "bar",
                "title": "Average Tensile Strength by Material",
                "x_label": "Material",
                "y_label": "Tensile Strength (MPa)",
                "series": [
                    {"label": "Material A", "value": 420.5},
                    {"label": "Material B", "value": 398.2},
                ],
            },
        )
        yield _sse_event("visualization", visualization.model_dump())

        # 6. Follow-up suggestions
        followups = [
            "Would you like to see the trend over time?",
            "Should I run a statistical significance test between material A and B?",
            "Want to filter by a specific batch or date range?",
        ]
        yield _sse_event("followups", {"suggestions": followups})

        # 7. Persist assistant message
        session.messages.append(
            Message(
                message_id=message_id,
                role="assistant",
                content=full_text,
                visualization=visualization,
                query_used=query,
            )
        )

        yield _sse_event("done", {})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# POST /api/chat  — non-streaming fallback
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Non-streaming fallback. Returns complete response in one JSON payload."""
    session = _get_or_create_session(req.session_id)
    message_id = str(uuid4())

    session.messages.append(Message(role="user", content=req.message))

    query = "SELECT material, AVG(tensile_strength) FROM test_results GROUP BY material"
    text = (
        "Based on the available test data, here is a summary of tensile strength by material. "
        "This is a stub response — connect your LLM and data layer to populate real results."
    )
    visualization = VisualizationBlock(
        type="chart",
        data={
            "chart_type": "bar",
            "title": "Average Tensile Strength by Material",
            "x_label": "Material",
            "y_label": "Tensile Strength (MPa)",
            "series": [
                {"label": "Material A", "value": 420.5},
                {"label": "Material B", "value": 398.2},
            ],
        },
    )
    followups = [
        "Would you like to see the trend over time?",
        "Should I run a statistical significance test between material A and B?",
    ]
    thinking = [
        "Parsing your question...",
        "Searching relevant test result columns...",
        "Building query...",
    ]

    session.messages.append(
        Message(
            message_id=message_id,
            role="assistant",
            content=text,
            visualization=visualization,
            query_used=query,
        )
    )

    return ChatResponse(
        session_id=session.session_id,
        message_id=message_id,
        text=text,
        visualization=visualization,
        followups=followups,
        query_used=query,
        thinking=thinking,
    )


# ---------------------------------------------------------------------------
# GET /api/sessions
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions() -> SessionListResponse:
    """Return all sessions (summaries) plus the current data schema."""
    summaries = [
        SessionSummary(
            session_id=s.session_id,
            title=s.title or (s.messages[0].content[:60] if s.messages else None),
            updated_at=s.updated_at,
            message_count=len(s.messages),
        )
        for s in sorted(_sessions.values(), key=lambda s: s.updated_at, reverse=True)
    ]
    return SessionListResponse(sessions=summaries, schema=STUB_SCHEMA)


# ---------------------------------------------------------------------------
# GET /api/sessions/{session_id}
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str) -> Session:
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ---------------------------------------------------------------------------
# DELETE /api/sessions/{session_id}
# ---------------------------------------------------------------------------


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del _sessions[session_id]
    return {"status": "deleted", "session_id": session_id}
