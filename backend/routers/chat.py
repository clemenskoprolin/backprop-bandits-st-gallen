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

        from src.agent import agent
        from langchain_core.messages import HumanMessage
        config = {"configurable": {"thread_id": session.session_id}}
        
        full_text = ""
        visualization = None
        
        async for event in agent.astream_events({"messages": [HumanMessage(content=req.message)]}, config, version="v2"):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    full_text += chunk.content
                    yield _sse_event("text", {"chunk": chunk.content})
            elif kind == "on_tool_start":
                tool_name = event["name"]
                if tool_name != "render_visualization":
                    yield _sse_event("thinking", {"step": f"Executing query: {tool_name}..."})
                else:
                    yield _sse_event("thinking", {"step": "Rendering visualization..."})
            elif kind == "on_tool_end":
                if event["name"] == "render_visualization":
                    try:
                        import json
                        kwargs = event['data'].get("input", {})
                        series_data = kwargs.get("series_json", "[]")
                        if isinstance(series_data, str):
                            series_data = json.loads(series_data)
                            
                        vis = VisualizationBlock(
                            type="chart",
                            data={
                                "chart_type": kwargs.get("chart_type", "bar"),
                                "title": kwargs.get("title", ""),
                                "x_label": kwargs.get("x_label", ""),
                                "y_label": kwargs.get("y_label", ""),
                                "series": series_data,
                            },
                        )
                        visualization = vis
                        yield _sse_event("visualization", vis.model_dump())
                    except Exception as e:
                        print("Visualization rendering error:", e)

        # 7. Persist assistant message
        session.messages.append(
            Message(
                message_id=message_id,
                role="assistant",
                content=full_text,
                visualization=visualization,
                query_used=None,
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

    query = None
    
    from src.agent import agent
    from langchain_core.messages import HumanMessage
    config = {"configurable": {"thread_id": session.session_id}}
    response = await agent.ainvoke({"messages": [HumanMessage(content=req.message)]}, config)
    
    # Process output
    messages = response['messages']
    ai_msg = messages[-1]
    text = ai_msg.content
    visualization = None
    thinking = []
    
    # Check if render_visualization was called to fetch the block
    for msg in reversed(messages):
        if getattr(msg, "name", None) == "render_visualization":
            # Extract visualization kwargs from the previous AIMessage's tool_call
            for prior_msg in reversed(messages):
                if prior_msg.tool_calls:
                    for tc in prior_msg.tool_calls:
                        if tc['name'] == 'render_visualization':
                            # Build the visualization block
                            import json
                            kwargs = tc['args']
                            series_data = kwargs.get("series_json", "[]")
                            if isinstance(series_data, str):
                                try:
                                    series_data = json.loads(series_data)
                                except:
                                    series_data = []
                            visualization = VisualizationBlock(
                                type="chart",
                                data={
                                    "chart_type": kwargs.get("chart_type", "bar"),
                                    "title": kwargs.get("title", ""),
                                    "x_label": kwargs.get("x_label", ""),
                                    "y_label": kwargs.get("y_label", ""),
                                    "series": series_data,
                                },
                            )
                            break
                    if visualization: break
            if visualization: break
        if getattr(msg, "name", None) in ["get_test", "search_tests", "get_aggregated_data_for_chart"]:
            thinking.append(f"Used tool: {msg.name}")

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
        followups=[],
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
