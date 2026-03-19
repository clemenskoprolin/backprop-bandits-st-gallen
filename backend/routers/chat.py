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

import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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
    WidgetLayout,
)


class RenameSessionRequest(BaseModel):
    title: str


class SaveWidgetLayoutsRequest(BaseModel):
    layouts: list[WidgetLayout]

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

def get_similarity_by_query(message: str):
    return "hello"


# Keys that represent x-axis labels rather than numeric series
_LABEL_KEYS = {"name", "label", "category", "group", "month", "date", "material"}


def _build_chart_vis(kwargs: dict) -> VisualizationBlock:
    """Build a VisualizationBlock in the shape the frontend expects.

    Frontend ChartData: { chartType, title, xAxis, yAxis, data: Record[], series: {key,label,color}[] }
    """
    series_data = kwargs.get("series_json", "[]")
    if isinstance(series_data, str):
        series_data = json.loads(series_data)
    if not isinstance(series_data, list):
        series_data = []

    # Auto-generate series metadata from data keys
    series_meta = []
    if series_data:
        sample = series_data[0] if isinstance(series_data[0], dict) else {}
        idx = 0
        for key, val in sample.items():
            if key.lower() in _LABEL_KEYS:
                continue
            if isinstance(val, (int, float)):
                idx += 1
                series_meta.append({
                    "key": key,
                    "label": key.replace("_", " ").title(),
                    "color": f"var(--chart-{idx})",
                })

    return VisualizationBlock(
        type="chart",
        data={
            "chartType": kwargs.get("chart_type", "bar"),
            "title": kwargs.get("title", ""),
            "xAxis": kwargs.get("x_label", ""),
            "yAxis": kwargs.get("y_label", ""),
            "data": series_data,
            "series": series_meta,
        },
    )


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
        try:
            from src.agent import Agent
            from langchain_core.messages import HumanMessage
            similar_messages = get_similarity_by_query(req.message)
            tmp = Agent(req.message, similar_messages)
            agent = tmp.create()
            config = {"configurable": {"thread_id": session.session_id}}
            
            full_text = ""
            visualization = None
            
            async for event in agent.astream_events({"messages": [HumanMessage(content=req.message)]}, config, version="v2"):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    content = chunk.content
                    if isinstance(content, list):
                        text = "".join(block.get("text", "") for block in content if block.get("type") == "text")
                    else:
                        text = content
                    
                    if text:
                        full_text += text
                        yield _sse_event("text", {"chunk": text})
                elif kind == "on_tool_start":
                    tool_name = event["name"]
                    if tool_name == "render_visualization":
                        yield _sse_event("thinking", {"step": "Rendering visualization..."})
                    elif tool_name == "run_python_analysis":
                        yield _sse_event("thinking", {"step": "Running statistical analysis..."})
                    else:
                        yield _sse_event("thinking", {"step": f"Executing query: {tool_name}..."})
                elif kind == "on_tool_end":
                    if event["name"] == "render_visualization":
                        try:
                            kwargs = event['data'].get("input", {})
                            vis = _build_chart_vis(kwargs)
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
        except Exception as e:
            import traceback
            print("ERROR in event_generator:", e)
            traceback.print_exc()
            yield _sse_event("error", {"message": str(e)})
        yield _sse_event("done", {})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
    
    from src.agent import Agent
    from langchain_core.messages import HumanMessage
    config = {"configurable": {"thread_id": session.session_id}}
    similar_messages = get_similarity_by_query(req.message)
    tmp = Agent(req.message, similar_messages)
    agent = tmp.create()
    response = await agent.ainvoke({"messages": [HumanMessage(content=req.message)]}, config)
    
    # Process output
    messages = response['messages']
    print(messages)
    ai_msg = messages[-1]
    text = ai_msg.content
    # ai_msg = messages
    # text = ai_msg
    visualization = None
    thinking = []
    
    # Check if render_visualization was called to fetch the block
    for msg in reversed(messages):
        if getattr(msg, "name", None) == "render_visualization":
            # Extract visualization kwargs from the previous AIMessage's tool_call
            for prior_msg in reversed(messages):
                if prior_msg.type == "ai" and prior_msg.tool_calls:
                    for tc in prior_msg.tool_calls:
                        if tc['name'] == 'render_visualization':
                            visualization = _build_chart_vis(tc['args'])
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


@router.patch("/sessions/{session_id}")
async def rename_session(session_id: str, req: RenameSessionRequest):
    """Rename a session."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = req.title
    return {"status": "updated", "session_id": session_id, "title": req.title}


@router.put("/sessions/{session_id}/widgets")
async def save_widget_layouts(session_id: str, req: SaveWidgetLayoutsRequest):
    """Save dashboard widget layouts for a session."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.widget_layouts = req.layouts
    return {"status": "saved", "session_id": session_id, "count": len(req.layouts)}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    del _sessions[session_id]
    return {"status": "deleted", "session_id": session_id}
