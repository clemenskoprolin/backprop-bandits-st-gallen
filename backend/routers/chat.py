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
import logging
import requests
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
    WidgetLayout,
)


class RenameSessionRequest(BaseModel):
    title: str


class SaveWidgetLayoutsRequest(BaseModel):
    layouts: list[WidgetLayout]

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger(__name__)

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
    new_session = Session(session_id=session_id if session_id else str(uuid4()))
    _sessions[new_session.session_id] = new_session
    return new_session


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _text_metrics(text: str | None) -> dict:
    value = text or ""
    chars = len(value)
    return {
        "chars": chars,
        "bytes": len(value.encode("utf-8")),
        "est_tokens": max(1, round(chars / 4)) if chars else 0,
    }

def get_similarity_by_query(message: str, session_id):
    try:
        print("Querying")
        print(message, session_id)
        response = requests.post("http://localhost:3002/generate_context", json={
            "query": message,
            "session_id": session_id
        })
        print(response.status_code)
        print(response.text)
        context = response.json().get("context", "")
        source_metrics = _text_metrics(context)
        trimmed_context = context[:100]
        trimmed_metrics = _text_metrics(trimmed_context)
        logger.info(
            "[context-debug] rag context fetched: source_chars=%s source_bytes=%s source_est_tokens=%s returned_chars=%s returned_est_tokens=%s",
            source_metrics["chars"],
            source_metrics["bytes"],
            source_metrics["est_tokens"],
            trimmed_metrics["chars"],
            trimmed_metrics["est_tokens"],
        )
        return trimmed_context
    except Exception as e:
        print("Exception with rag:", e)
        return ""



# ---------------------------------------------------------------------------
# POST /api/chat/stream  — SSE primary endpoint
# ---------------------------------------------------------------------------


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    session = _get_or_create_session(req.session_id)
    message_id = str(uuid4())
    session.messages.append(Message(role="user", content=req.message))

    async def event_generator():
        yield _sse_event("session", {"session_id": session.session_id, "message_id": message_id})
        try:
            from src.agent import Agent
            from langchain_core.messages import HumanMessage
            request_metrics = _text_metrics(req.message)
            logger.info(
                "[context-debug] chat_stream request: chars=%s bytes=%s est_tokens=%s dashboard_widgets=%s",
                request_metrics["chars"],
                request_metrics["bytes"],
                request_metrics["est_tokens"],
                len(req.dashboard_widgets or []),
            )
            similar_messages = get_similarity_by_query(req.message, req.session_id)
            similar_metrics = _text_metrics(similar_messages)
            logger.info(
                "[context-debug] chat_stream similar context passed to Agent: chars=%s bytes=%s est_tokens=%s",
                similar_metrics["chars"],
                similar_metrics["bytes"],
                similar_metrics["est_tokens"],
            )
            dashboard_ctx = [w.model_dump() for w in req.dashboard_widgets] if req.dashboard_widgets else []
            tmp = Agent(req.message, similar_messages, dashboard_widgets=dashboard_ctx)
            agent = tmp.create()
            config = {"configurable": {"thread_id": session.session_id}}

            full_text = ""
            visualization = None
            visualizations = []
            followups = []
            thinking = []
            query_used = None

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
                    elif tool_name == "render_text_block":
                        yield _sse_event("thinking", {"step": "Creating text block..."})
                    elif tool_name == "run_python_analysis":
                        yield _sse_event("thinking", {"step": "Running statistical analysis..."})
                    elif tool_name == "remove_widget":
                        yield _sse_event("thinking", {"step": "Removing widget from dashboard..."})
                    elif tool_name == "reorder_dashboard":
                        yield _sse_event("thinking", {"step": "Reordering dashboard..."})
                    elif tool_name == "submit_answer":
                        pass  # don't show this as a thinking step
                    elif tool_name in ("find", "aggregate", "count"):
                        tool_input = event["data"].get("input", {})
                        collection = tool_input.get("collection", "?")
                        query_str = json.dumps(tool_input, indent=2, default=str)
                        formatted = f"db.{collection}.{tool_name}({query_str})"
                        if query_used:
                            query_used += "\n\n" + formatted
                        else:
                            query_used = formatted
                        thinking.append(f"Executing: {formatted}")
                        yield _sse_event("thinking", {"step": f"Executing: {formatted}"})
                    else:
                        thinking.append(f"Used tool: {tool_name}")
                        yield _sse_event("thinking", {"step": f"Executing query: {tool_name}..."})

                elif kind == "on_tool_end":
                    tool_name = event["name"]

                    tool_output = event.get("data", {}).get("output", "")
                    output_metrics = _text_metrics(str(tool_output))
                    logger.info(
                        "[context-debug] tool_end '%s': output_chars=%s output_est_tokens=%s",
                        tool_name,
                        output_metrics["chars"],
                        output_metrics["est_tokens"]
                    )

                    if tool_name == "render_visualization":
                        try:
                            kwargs = event['data'].get("input", {})
                            data = kwargs.get("data_json", "[]")
                            if isinstance(data, str):
                                data = json.loads(data)
                            chart_config = kwargs.get("chart_config_json", "{}")
                            if isinstance(chart_config, str):
                                chart_config = json.loads(chart_config)
                            visualization = {
                                "type": "chart",
                                "data": {
                                    "chartType": kwargs.get("chart_type", "bar").lower(),
                                    "title": kwargs.get("title", ""),
                                    "description": kwargs.get("description", ""),
                                    "xAxisKey": kwargs.get("x_axis_key", "name"),
                                    "data": data,
                                    "chartConfig": chart_config,
                                },
                            }
                            replace_widget_id = kwargs.get("replace_widget_id", "")
                            if replace_widget_id:
                                visualization["replace_widget_id"] = replace_widget_id
                            widget_size = kwargs.get("widget_size", "")
                            if widget_size:
                                visualization["widget_size"] = widget_size
                            visualizations.append(visualization)
                            yield _sse_event("visualization", visualization)
                        except Exception as e:
                            print("Visualization rendering error:", e)

                    elif tool_name == "render_text_block":
                        try:
                            kwargs = event['data'].get("input", {})
                            text_vis = {
                                "type": "paragraphs",
                                "data": {
                                    "title": kwargs.get("title", ""),
                                    "content": kwargs.get("content", ""),
                                },
                            }
                            replace_widget_id = kwargs.get("replace_widget_id", "")
                            if replace_widget_id:
                                text_vis["replace_widget_id"] = replace_widget_id
                            widget_size = kwargs.get("widget_size", "")
                            if widget_size:
                                text_vis["widget_size"] = widget_size
                            visualizations.append(text_vis)
                            yield _sse_event("visualization", text_vis)
                        except Exception as e:
                            print("render_text_block error:", e)

                    elif tool_name == "remove_widget":
                        try:
                            kwargs = event['data'].get("input", {})
                            widget_id = kwargs.get("widget_id", "")
                            if widget_id:
                                yield _sse_event("remove_widget", {"widget_id": widget_id})
                        except Exception as e:
                            print("remove_widget error:", e)

                    elif tool_name == "reorder_dashboard":
                        try:
                            kwargs = event['data'].get("input", {})
                            widget_ids = kwargs.get("widget_ids", [])
                            print(f"[reorder_dashboard] widget_ids={widget_ids}")
                            if widget_ids:
                                yield _sse_event("reorder_dashboard", {"widget_ids": widget_ids})
                        except Exception as e:
                            print("reorder_dashboard error:", e)

                    elif tool_name == "submit_answer":
                        try:
                            kwargs = event['data'].get("input", {})
                            answer = kwargs.get("answer", "")
                            followups = kwargs.get("hypotheses", [])
                            full_text = answer  # override streamed text with structured answer
                            yield _sse_event("followups", {"suggestions": followups})
                        except Exception as e:
                            print("submit_answer parsing error:", e)

            if query_used:
                yield _sse_event("query", {"query_used": query_used})

            session.messages.append(
                Message(
                    message_id=message_id,
                    role="assistant",
                    content=full_text,
                    visualization=visualization,
                    visualizations=visualizations,
                    query_used=query_used,
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
    request_metrics = _text_metrics(req.message)
    logger.info(
        "[context-debug] chat request: chars=%s bytes=%s est_tokens=%s",
        request_metrics["chars"],
        request_metrics["bytes"],
        request_metrics["est_tokens"],
    )
    similar_messages = get_similarity_by_query(req.message, req.session_id)
    similar_metrics = _text_metrics(similar_messages)
    logger.info(
        "[context-debug] chat similar context passed to Agent: chars=%s bytes=%s est_tokens=%s",
        similar_metrics["chars"],
        similar_metrics["bytes"],
        similar_metrics["est_tokens"],
    )
    tmp = Agent(req.message, similar_messages)
    agent = tmp.create()
    response = await agent.ainvoke({"messages": [HumanMessage(content=req.message)]}, config)

    # Process output
    messages = response['messages']
    print(messages)
    ai_msg = messages[-1]
    text = ai_msg
    # ai_msg = messages
    # text = ai_msg
    visualization = None
    thinking = []

    # Check if render_visualization was called to fetch the block
    for msg in reversed(messages):
        if getattr(msg, "name", None) == "render_visualization":
            for prior_msg in reversed(messages):
                if prior_msg.type == "ai" and prior_msg.tool_calls:
                    for tc in prior_msg.tool_calls:
                        if tc['name'] == 'render_visualization':
                            kwargs = tc['args']
                            data = kwargs.get("data_json", "[]")
                            if isinstance(data, str):
                                try:
                                    data = json.loads(data)
                                except:
                                    data = []
                            chart_config = kwargs.get("chart_config_json", "{}")
                            if isinstance(chart_config, str):
                                try:
                                    chart_config = json.loads(chart_config)
                                except:
                                    chart_config = {}
                            visualization = {
                                "type": "chart",
                                "data": {
                                    "chartType": kwargs.get("chart_type", "bar").lower(),
                                    "title": kwargs.get("title", ""),
                                    "description": kwargs.get("description", ""),
                                    "xAxisKey": kwargs.get("x_axis_key", "name"),
                                    "data": data,
                                    "chartConfig": chart_config,
                                },
                            }
                            break
                    if visualization: break
            if visualization: break
        if getattr(msg, "name", None) in ["get_test", "search_tests", "get_aggregated_data_for_chart"]:
            thinking.append(f"Used tool: {msg.name}")

    submitted_answer = text.tool_calls[0]
    kwargs = submitted_answer['args']
    text = kwargs.get('answer', '')
    followups = kwargs.get('hypotheses',[])
    print(text)
    print(followups)
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
