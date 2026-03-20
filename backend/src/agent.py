import base64
import json
import uuid
import concurrent.futures
import logging
from typing import Literal
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from dotenv import load_dotenv
from src import db
from src.db_context import build_db_context, resolve_childId
from langchain_core.messages import trim_messages
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from langchain_mcp_adapters.tools import load_mcp_tools
from contextlib import AsyncExitStack
import asyncio



import os

load_dotenv()

logger = logging.getLogger(__name__)

_orig_warn = logging.root.warning
def _traced_warn(msg, *args, **kwargs):
    if "Failed to validate" in str(msg):
        import traceback, io
        buf = io.StringIO()
        traceback.print_stack(file=buf)
        print("=== PING STACK TRACE ===")
        print(buf.getvalue())
        print("=== END TRACE ===")
    _orig_warn(msg, *args, **kwargs)
logging.root.warning = _traced_warn

# ---------------------------------------------------------------------------
# Paths for UUID lookup tables (adjust if your project layout differs)
# ---------------------------------------------------------------------------
_SRC_DIR = os.path.dirname(os.path.abspath(__file__))
_CHANNEL_MAP_PATH     = os.path.join(_SRC_DIR, "..", "data", "channelParameterMap.json")
_RESULT_TYPE_MAP_PATH = os.path.join(_SRC_DIR, "..", "data", "TestResultTypes.json")

# Module-level reference to the active Agent's tool_results, set by Agent._wrap_tool_node
_active_tool_results: dict[str, dict] = {}

# Holds the dynamically built DB context string (populated in init_mcp_client)
_db_context_string: str = ""


def _resolve_data_id(data_id: str) -> str | None:
    """Look up a data_id in the active tool results and return the stored data."""
    entry = _active_tool_results.get(data_id)
    if entry is None:
        return None
    return entry["data"]


def _text_metrics(text: str | None) -> dict:
    value = text or ""
    chars = len(value)
    bytes_len = len(value.encode("utf-8"))
    return {
        "chars": chars,
        "bytes": bytes_len,
        "est_tokens": max(1, round(chars / 4)) if chars else 0,
    }


def _message_metrics(messages) -> dict:
    per_message_chars = []
    total_chars = 0
    for msg in messages:
        content = getattr(msg, "content", "")
        if isinstance(content, str):
            chars = len(content)
        elif isinstance(content, list):
            chars = len(json.dumps(content, default=str))
        else:
            chars = len(str(content))
        per_message_chars.append(chars)
        total_chars += chars

    return {
        "message_count": len(messages),
        "total_chars": total_chars,
        "total_est_tokens": max(1, round(total_chars / 4)) if total_chars else 0,
        "per_message_chars": per_message_chars,
    }


def _dump_invoke_context(node_name: str, messages: list):
    import time

    debug_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "debug_contexts"
    )
    os.makedirs(debug_dir, exist_ok=True)
    query_id = str(int(time.time() * 1000))
    debug_file = os.path.join(debug_dir, f"invoke_{node_name}_{query_id}.json")

    dumpable_messages = []
    for msg in messages:
        try:
            dumpable_messages.append(
                {"type": type(msg).__name__, "content": getattr(msg, "content", "")}
            )
        except Exception:
            dumpable_messages.append({"type": str(type(msg)), "content": str(msg)})

    try:
        with open(debug_file, "w", encoding="utf-8") as f:
            json.dump(
                {"node": node_name, "messages": dumpable_messages},
                f,
                indent=2,
                ensure_ascii=False,
            )
    except Exception as e:
        logger.error(f"Failed to dump invoke context: {e}")


# ---------------------------------------------------------------------------
# MCP server config
# ---------------------------------------------------------------------------

# agent.py — replace MCP_SERVERS config
MCP_SERVERS = {
    "mongodb": {
        "command": "docker",
        "args": [
            "run", "--rm", "-i",
            "-e", f"MDB_MCP_CONNECTION_STRING=mongodb://admin:olmamessen1st@202.61.251.60:27017/?authSource=admin",
            "mongodb/mongodb-mcp-server:latest"
        ],
        "transport": "stdio",
    }
}


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool
async def get_sample_documents() -> str:
    """Returns sample documents from the _tests collection as a JSON string."""
    results = await db.get_sample_documents()
    return json.dumps(results, default=str)


@tool
async def get_aggregated_data_for_chart(
    group_by_field: str, aggregations: str, match_filters: str = None
) -> str:
    """
    Get aggregated test data formatted for Recharts visualization.
    Returns: [{"name": "Group A", "value1": 10}, {"name": "Group B", "value1": 20}]

    Args:
        group_by_field: MongoDB field to group by. Example: "$TestParametersFlat.SPECIMEN_TYPE"
        aggregations: JSON aggregation ops. Example: '{"avgForce": {"$avg": "$TestParametersFlat.Upper force limit"}}'
        match_filters: Optional JSON match filters. Example: '{"state": "finishedOK"}'
    """
    try:
        agg_dict   = json.loads(aggregations)    if aggregations    else {}
        match_dict = json.loads(match_filters)   if match_filters   else None
    except json.JSONDecodeError as e:
        return f"Error: Failed to parse JSON arguments: {e}"

    results = await db.aggregate_for_recharts(group_by_field, agg_dict, match_dict)
    return json.dumps(results, default=str)


@tool
def render_visualization(
    chart_type: str,
    title: str,
    x_axis_key: str,
    data_json: str,
    chart_config_json: str,
    description: str = "",
    replace_widget_id: str = "",
    widget_size: str = "1x2",
    data_id: str = "",
) -> str:
    """
    Render a chart on the user's dashboard.
    ALWAYS call this when displaying aggregated/statistical data.

    Args:
        chart_type: One of 'bar', 'area', 'line', 'pie', 'radar', 'radial', 'boxplot'.
        title: Chart title.
        x_axis_key: The key in data records used for the x-axis / category labels.
        data_json: JSON string of FLAT records array.
        chart_config_json: JSON string defining series metadata (label + color per key).
        description: Optional short description shown below the title.
        replace_widget_id: Pass an existing widget's id to update it in-place.
        widget_size: HxW format — "1x1", "1x2" (default), "2x1", "2x2".
        data_id: Optional data_id from a previous MongoDB tool result (flat records only).
    """
    if data_id:
        resolved = _resolve_data_id(data_id)
        if resolved is not None:
            data_json = resolved
        else:
            logger.warning(
                "render_visualization: unknown data_id %s, falling back to data_json",
                data_id,
            )
    return "Visualization successfully rendered on UI."


@tool
def render_text_block(
    title: str, content: str, replace_widget_id: str = "", widget_size: str = "1x2"
) -> str:
    """
    Render a Markdown text block on the user's dashboard.

    Args:
        title: Short widget title.
        content: Markdown body (## headings, **bold**, bullet lists, etc.).
        replace_widget_id: Pass an existing widget's id to update it in-place.
        widget_size: "1x1", "1x2" (default), "2x1", "2x2".
    """
    return "Text block rendered on dashboard."


@tool
def remove_widget(widget_id: str, reason: str = "") -> str:
    """
    Remove a widget from the user's dashboard.

    Args:
        widget_id: The widget ID to remove.
        reason: Brief reason for removal.
    """
    return f"Widget {widget_id} removed from dashboard."


@tool
def reorder_dashboard(widget_ids: list[str]) -> str:
    """
    Reorder widgets on the user's dashboard.

    Args:
        widget_ids: List of widget IDs in the desired display order.
    """
    return f"Dashboard reordered with {len(widget_ids)} widgets."


@tool
def submit_answer(answer: str, hypotheses: list[str]) -> str:
    """
    Always call this tool to submit your final answer and hypotheses.

    Args:
        answer: Clear, concise answer to the user's question.
        hypotheses: List of 3 follow-up hypotheses worth investigating. Empty list if none.
    """
    return "Answer submitted."


@tool
def run_python_analysis(
    code: str, data_json: str = "", data_id: str = "", data_ids: list[str] = []
) -> str:
    """
    Execute a Python code snippet for statistical analysis on material testing data.

    The execution environment pre-populates:
      - `data`: list of dicts parsed from data_json (or resolved from data_id)
      - `df`: pandas DataFrame built from data
      - `datasets`: dict mapping data_id → resolved data (only when data_ids is used)
      - `np`: numpy  |  `pd`: pandas  |  `stats`: scipy.stats

    Assign your final answer to `result`.

    Args:
        code: Python snippet. Must assign `result` to capture output.
        data_json: JSON string (list of dicts). Omit if using data_id / data_ids.
        data_id: data_id from a previous MongoDB tool result.
        data_ids: List of data_ids — all resolved into `datasets` dict.
    """
    import numpy as np
    import pandas as pd
    from scipy import stats
    from langchain_experimental.utilities import PythonREPL

    TIMEOUT_SECONDS = 10
    datasets: dict = {}

    if data_ids:
        for did in data_ids:
            resolved = _resolve_data_id(did)
            if resolved is None:
                return json.dumps(
                    {"error": f"Unknown data_id: {did}", "output": "", "result": None}
                )
            datasets[did] = json.loads(resolved) if isinstance(resolved, str) else resolved
        data = datasets[data_ids[0]]
    elif data_id:
        resolved = _resolve_data_id(data_id)
        if resolved is None:
            return json.dumps(
                {"error": f"Unknown data_id: {data_id}", "output": "", "result": None}
            )
        data = json.loads(resolved) if isinstance(resolved, str) else resolved
    else:
        try:
            data = json.loads(data_json) if data_json else []
        except json.JSONDecodeError as e:
            return json.dumps(
                {"error": f"Failed to parse data_json: {e}", "output": "", "result": None}
            )

    repl = PythonREPL()
    repl.globals.update(
        {
            "np": np,
            "pd": pd,
            "stats": stats,
            "data": data,
            "datasets": datasets,
            "df": (
                pd.DataFrame(data)
                if isinstance(data, list) and data and isinstance(data[0], dict)
                else pd.DataFrame()
            ),
            "result": None,
        }
    )

    def _execute():
        return repl.run(code)

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_execute)
            output = future.result(timeout=TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        return json.dumps(
            {"error": f"Execution timed out after {TIMEOUT_SECONDS} seconds.", "output": "", "result": None}
        )
    except Exception as e:
        return json.dumps(
            {"error": f"Execution error: {type(e).__name__}: {e}", "output": "", "result": None}
        )

    raw_result = repl.globals.get("result") or repl.locals.get("result")
    try:
        serialized_result = json.loads(json.dumps(raw_result, default=str))
    except Exception:
        serialized_result = str(raw_result)

    return json.dumps({"output": output, "result": serialized_result})


# ---------------------------------------------------------------------------
# Tool groups
# ---------------------------------------------------------------------------

custom_tools    = [run_python_analysis, resolve_childId]
dashboard_tools = [render_visualization, render_text_block, remove_widget, reorder_dashboard]
tool_node         = ToolNode(custom_tools + dashboard_tools)
visualization_tool = ToolNode(dashboard_tools)
submit_tool       = ToolNode([submit_answer])

#llm              = ChatOpenAI(model="gpt-5.4")
llm = ChatAnthropic(model="claude-sonnet-4-6")
llm_with_tools   = llm.bind_tools(custom_tools)
llm_visualizer   = llm.bind_tools(dashboard_tools)
llm_output       = llm.bind_tools([submit_answer], tool_choice="submit_answer")

_all_tools = custom_tools.copy()


# ---------------------------------------------------------------------------
# MCP initialisation — also builds DB context here
# ---------------------------------------------------------------------------

_mcp_exit_stack: AsyncExitStack | None = None
_ping_task: asyncio.Task | None = None


async def _ping_keepalive(session: ClientSession, interval: float = 25.0):
    """
    Proactively send client→server pings on our schedule.
    This keeps the connection alive AND means we control the ping timing,
    reducing the chance the server sends an unsolicited ping mid-request.
    """
    try:
        while True:
            await asyncio.sleep(interval)
            try:
                await session.send_ping()
            except Exception as e:
                logger.debug("[mcp] ping failed: %s", e)
                break
    except asyncio.CancelledError:
        pass


async def init_mcp_client():
    global mcp_tools, _all_tools, tool_node, llm_with_tools
    global _db_context_string, _mcp_exit_stack, _ping_task

    # 1. Build DB context
    _db_context_string = await build_db_context(
        db_module=db,
        channel_map_path=_CHANNEL_MAP_PATH if os.path.exists(_CHANNEL_MAP_PATH) else None,
        result_type_map_path=_RESULT_TYPE_MAP_PATH if os.path.exists(_RESULT_TYPE_MAP_PATH) else None,
    )
    logger.info("[db-context] Built DB context (%d chars)", len(_db_context_string))

    # 2. Open transport + session manually so we control the lifecycle
    mcp_url = os.getenv("MCP_URL", "http://202.61.251.60:3001/mcp")
    _mcp_exit_stack = AsyncExitStack()

    read, write, _ = await _mcp_exit_stack.enter_async_context(
        streamablehttp_client(mcp_url)
    )
    session: ClientSession = await _mcp_exit_stack.enter_async_context(
        ClientSession(read, write)
    )
    await session.initialize()
    logger.info("[mcp] Session initialized")

    # 3. Start proactive ping task — suppresses server-initiated pings
    #    by keeping the connection visibly alive from our side
    _ping_task = asyncio.create_task(_ping_keepalive(session))

    # 4. Patch the session's notification handler to silently swallow
    #    any ping frames that still arrive from the server side
    _original_recv = session._received_notification if hasattr(
        session, "_received_notification"
    ) else None

    if _original_recv:
        async def _safe_recv_notification(notification):
            try:
                await _original_recv(notification)
            except Exception as e:
                logger.debug("[mcp] swallowed notification error: %s", e)
        session._received_notification = _safe_recv_notification

    # 5. Load tools and rebuild tool/llm bindings
    mcp_tools = await load_mcp_tools(session)
    logger.info("[mcp] Loaded %d tools", len(mcp_tools))

    _all_tools     = custom_tools + mcp_tools
    tool_node      = ToolNode(_all_tools)
    llm_with_tools = llm.bind_tools(_all_tools)

    return mcp_tools


async def shutdown_mcp_client():
    global _mcp_exit_stack, _ping_task
    if _ping_task and not _ping_task.done():
        _ping_task.cancel()
        try:
            await _ping_task
        except asyncio.CancelledError:
            pass
    if _mcp_exit_stack:
        await _mcp_exit_stack.aclose()
        _mcp_exit_stack = None

def _patch_mcp_session():
    """
    Patch BaseSession to swallow server-initiated pings before Pydantic
    validation consumes them and drops the pending response Future.
    """
    import mcp.shared.session as _sess

    if getattr(_sess.BaseSession, '_ping_patch_applied', False):
        return  # idempotent

    original_handle = _sess.BaseSession._handle_incoming

    async def _patched_handle_incoming(self, message):
        # message is a SessionMessage | Exception
        # Check for ping before Pydantic tries to validate it as ServerNotification
        try:
            from mcp.shared.message import SessionMessage
            if isinstance(message, SessionMessage):
                raw = getattr(message.message, 'root', None)
                if raw is not None and getattr(raw, 'method', None) == 'ping':
                    # It's a request (has an id) — send an empty pong
                    req_id = getattr(raw, 'id', None)
                    if req_id is not None:
                        import mcp.types as _t
                        pong = _t.JSONRPCMessage(
                            _t.JSONRPCResponse(jsonrpc='2.0', id=req_id, result={})
                        )
                        await self._write_stream.send(SessionMessage(message=pong))
                    return  # swallow either way — don't pass to normal dispatch
        except Exception as e:
            import logging
            logging.getLogger(__name__).debug("[mcp-patch] ping intercept error: %s", e)

        return await original_handle(self, message)

    _sess.BaseSession._handle_incoming = _patched_handle_incoming
    _sess.BaseSession._ping_patch_applied = True

_patch_mcp_session()

# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

memory = MemorySaver()

# These are overwritten per-Agent instance in Agent.__init__
system_prompt            = ""
output_system_prompt     = ""
visualizer_system_prompt = ""


def call_model(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=system_prompt)] + messages
    metrics = _message_metrics(messages)
    logger.warning(
        "[context-debug] call_model payload: messages=%s total_chars=%s est_tokens=%s per_message_chars=%s",
        metrics["message_count"],
        metrics["total_chars"],
        metrics["total_est_tokens"],
        metrics["per_message_chars"],
    )
    _dump_invoke_context("call_model", messages)
    response = llm_with_tools.invoke(messages)
    tools_called = [tc["name"] for tc in getattr(response, "tool_calls", [])]
    action_label = f"calls tools: {', '.join(tools_called)}" if tools_called else "generates text"
    logger.warning("[context-debug] call_model action: %s", action_label)
    return {"messages": [response]}


def should_continue(state: MessagesState) -> Literal["tools", "visualizer"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "visualizer"


def output_node(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=output_system_prompt)] + messages
    messages = messages + [
        HumanMessage(content="Given the current conversation, summarize to an answer.")
    ]
    metrics = _message_metrics(messages)
    logger.info(
        "[context-debug] output_node payload: messages=%s total_chars=%s est_tokens=%s",
        metrics["message_count"],
        metrics["total_chars"],
        metrics["total_est_tokens"],
    )
    _dump_invoke_context("output_node", messages)
    response = llm_output.invoke(messages)
    tools_called = [tc["name"] for tc in getattr(response, "tool_calls", [])]
    action_label = f"calls tools: {', '.join(tools_called)}" if tools_called else "generates text"
    logger.info("[context-debug] output_node action: %s", action_label)
    return {"messages": [response]}


def visualizer(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=visualizer_system_prompt)] + messages
    messages = messages + [
        HumanMessage(
            content=(
                "Based on the results and the user's request, decide what dashboard actions to take. "
                "You can: render new visualizations with render_visualization, remove widgets with "
                "remove_widget, or reorder the dashboard with reorder_dashboard. Take action as needed."
            )
        )
    ]
    metrics = _message_metrics(messages)
    logger.info(
        "[context-debug] visualizer payload: messages=%s total_chars=%s est_tokens=%s",
        metrics["message_count"],
        metrics["total_chars"],
        metrics["total_est_tokens"],
    )
    _dump_invoke_context("visualizer", messages)
    response = llm_visualizer.invoke(messages)
    tools_called = [tc["name"] for tc in getattr(response, "tool_calls", [])]
    action_label = f"calls tools: {', '.join(tools_called)}" if tools_called else "generates text"
    logger.info("[context-debug] visualizer action: %s", action_label)
    return {"messages": [response]}


def has_visual(state: MessagesState) -> Literal["visual_tool", "output"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "visual_tool"
    return "output"


# ---------------------------------------------------------------------------
# Agent class
# ---------------------------------------------------------------------------

class Agent:
    def __init__(self, message, similar_text, dashboard_widgets=None):
        self.message           = message
        self.similar_text      = similar_text
        self.dashboard_widgets = dashboard_widgets or []
        self.tool_results: dict[str, dict] = {}

        similar_data = (
            "You are given the following similar text from a vectordb: " + self.similar_text
        )

        # ---- Dashboard context string ----------------------------------------
        dashboard_context = ""
        if self.dashboard_widgets:
            widget_descriptions = []
            for w in self.dashboard_widgets:
                selected_marker = " ⭐ SELECTED" if w.get("selected") else ""
                desc = (
                    f"- Widget '{w.get('title', 'Untitled')}' "
                    f"(id: {w.get('id', '?')}, type: {w.get('chart_type', '?')}, "
                    f"position: x={w.get('position', {}).get('x', 0)} "
                    f"y={w.get('position', {}).get('y', 0)} "
                    f"w={w.get('position', {}).get('w', 1)} "
                    f"h={w.get('position', {}).get('h', 1)}){selected_marker}"
                )
                pts = w.get("selected_data_points", [])
                if pts:
                    desc += f"\n  Selected data points: {json.dumps(pts)}"
                widget_descriptions.append(desc)

            selected_note = (
                "\nSelected widgets (marked ⭐) are the PRIMARY context for the user's "
                "question — focus analysis and modifications on these."
                if any(w.get("selected") for w in self.dashboard_widgets)
                else ""
            )
            dashboard_context = (
                f"\n\nCURRENT DASHBOARD STATE:\n"
                f"The user currently has {len(self.dashboard_widgets)} widget(s) on their dashboard:\n"
                + "\n".join(widget_descriptions)
                + f"\n{selected_note}\n"
                "You can reference existing widgets when answering. If the user asks to rearrange "
                "or reorganize the dashboard, you can create new visualizations that replace or "
                "complement existing ones.\n"
            )

        # ---- Grab the DB context built at startup ----------------------------
        # Falls back to a minimal placeholder if init_mcp_client hasn't run yet.
        db_context = _db_context_string or "(DB context not yet loaded — call init_mcp_client first)"

        # ---- System prompts --------------------------------------------------
        global system_prompt, output_system_prompt, visualizer_system_prompt

        system_prompt = f"""You are an AI material testing assistant with MongoDB database access.

{db_context}

AVAILABLE TOOLS:

MongoDB (from MCP server):
- `find`              — Query documents with filters, projection, and sorting
- `aggregate`         — Run aggregation pipelines
- `collection-schema` — Understand collection structure
- `list-collections`  — See available collections
- `count`             — Count matching documents

UUID resolution:
- `resolve_childId`   — Resolve any childId or valuetableId UUID to its human-readable name
  Always call this before referencing a channel or result type by UUID.

IMPORTANT — data_id and tool result format:
Every tool result is returned as a JSON object:
  {{ "data_id": "<uuid>", "info": ["Found N documents."], "result": [...] }}
If the payload exceeds the context limit, `result` is replaced by `summary` (truncated preview)
but the full dataset remains accessible via `data_id`.

Custom tools:
- `run_python_analysis` — Execute Python (numpy/pandas/scipy) on retrieved data.
    Accepts `data_json`, `data_id`, or `data_ids` (list).
    Assign your final answer to `result`.
- `render_visualization` — Display charts on the UI.
    data_json must be FLAT records: [{{"label": "A", "value1": 10}}].
    Use `data_id` only for already-flat aggregate results.
- `render_text_block`    — Pin a Markdown summary to the dashboard.
- `remove_widget`        — Remove a dashboard widget by id.
- `reorder_dashboard`    — Reorder widgets by providing ids in desired order.

Statistical Analysis workflow:
1. Use `find` or `aggregate` to retrieve raw data — note the `data_id`.
2. Pass `data_id` into `run_python_analysis` (or use `data_json` for small payloads).
3. For multi-dataset analysis pass multiple ids via `data_ids`; access each as `datasets["<id>"]`.
4. Assign answer to `result`, then compose your natural-language response.

ALWAYS call `render_visualization` when showing aggregated or statistical data.
{similar_data}
{dashboard_context}"""

        output_system_prompt = f"""You are a material testing AI assistant.

Based on the tool results and analysis above:
1. Write a clear, concise answer to the user's question.
2. Suggest 3 follow-up hypotheses worth investigating if there are any (don't force it).

Dashboard capabilities available to the user:
- Charts (bar, line, area, pie, radar, boxplot) for data visualizations
- Text/headline widgets with Markdown content (summaries, reports, key findings)
Never tell the user that text or headline widgets are unsupported — they are fully supported.
{similar_data}
Be very professional!"""

        visualizer_system_prompt = f"""You are CoMat, an AI material testing assistant.
Inspect if the previous results benefit from a visualization and act accordingly.

Use render_visualization for aggregated/statistical data — visualize whenever possible.
Use render_text_block only when the user explicitly requests a written dashboard summary,
or when structured textual findings add lasting dashboard value alongside charts.
Use remove_widget / reorder_dashboard when the user asks to clean up or rearrange.

Supported chart types: bar, area, line, pie, radar, radial, boxplot.

data_json must be FLAT records. Examples:
  bar/line/area : [{{"material": "Steel A", "tensile_strength": 420}}]
  pie           : [{{"name": "Material A", "value": 42}}]
  boxplot       : [{{"name": "Material A", "min": 350, "q1": 380, "median": 410, "q3": 440, "max": 470}}]

chart_config_json maps each numeric key → {{"label": "...", "color": "var(--chart-N)"}}.
Use var(--chart-1) … var(--chart-5) as default colors; honour user-specified CSS color names.
For pie/radial, set "fill" on each data record.

widget_size (HxW):
  "1x1" — single KPI / simple pie (≤5 slices)
  "1x2" — standard wide (DEFAULT)
  "2x1" — tall narrow / vertical ranked lists
  "2x2" — complex multi-series / boxplots with many groups

If a SELECTED widget (⭐) is targeted, pass its id as replace_widget_id.
{similar_data}
{dashboard_context}"""

        # ---- Debug dump -------------------------------------------------------
        import time
        debug_dir = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "debug_contexts"
        )
        os.makedirs(debug_dir, exist_ok=True)
        query_id   = str(int(time.time() * 1000))
        debug_file = os.path.join(debug_dir, f"query_{query_id}.json")
        try:
            with open(debug_file, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "user_message":           self.message,
                        "similar_text":           self.similar_text,
                        "dashboard_widgets":      self.dashboard_widgets,
                        "system_prompt":          system_prompt,
                        "output_system_prompt":   output_system_prompt,
                        "visualizer_system_prompt": visualizer_system_prompt,
                    },
                    f, indent=2, ensure_ascii=False,
                )
        except Exception as e:
            logger.error("Failed to dump debug context: %s", e)

        # ---- Metrics ---------------------------------------------------------
        logger.info(
            "[context-debug] prompt build: request_chars=%s similar_chars=%s dashboard_chars=%s widgets=%s",
            len(self.message), len(self.similar_text), len(dashboard_context),
            len(self.dashboard_widgets),
        )
        logger.info(
            "[context-debug] prompt build: system_chars=%s output_chars=%s visualizer_chars=%s db_context_chars=%s",
            len(system_prompt), len(output_system_prompt),
            len(visualizer_system_prompt), len(db_context),
        )

    # -------------------------------------------------------------------------
    # Summarisation helpers
    # -------------------------------------------------------------------------

    MAX_ITERABLE_SUMMARY_COUNT = 10
    MAX_STRING_SUMMARY_LENGTH  = 50

    def _summarize_json(self, object):
        if isinstance(object, str):
            if len(object) > self.MAX_STRING_SUMMARY_LENGTH:
                return (
                    object[: self.MAX_STRING_SUMMARY_LENGTH]
                    + f"... <TRUNCATED {len(object) - self.MAX_STRING_SUMMARY_LENGTH} characters>"
                )
            return object
        if isinstance(object, list):
            summarized = [
                self._summarize_json(item)
                for item in object[: self.MAX_ITERABLE_SUMMARY_COUNT]
            ]
            if len(object) > self.MAX_ITERABLE_SUMMARY_COUNT:
                summarized.append(
                    f"<TRUNCATED {len(object) - self.MAX_ITERABLE_SUMMARY_COUNT} items>"
                )
            return summarized
        if isinstance(object, dict):
            return {k: self._summarize_json(v) for k, v in object.items()}
        return object

    MAX_CONTEXT_RESULT_SIZE = 10000

    @staticmethod
    def _extract_mcp_data(structured_data):
        """Extract headers and actual data payload from MCP content blocks."""
        import re

        if not isinstance(structured_data, list):
            return [], structured_data

        headers       = []
        extracted_data = None
        for block in structured_data:
            if not isinstance(block, dict) or block.get("type") != "text":
                continue
            text = block.get("text", "")
            if extracted_data is None:
                found = False
                for match in re.finditer(
                    r"<untrusted-user-data-[^>]+>\s*(.*?)\s*</untrusted-user-data-[^>]+>",
                    text,
                    re.DOTALL,
                ):
                    try:
                        extracted_data = json.loads(match.group(1))
                        found = True
                        break
                    except (json.JSONDecodeError, TypeError):
                        continue
                if not found:
                    headers.append(text)
            else:
                headers.append(text)

        if extracted_data is not None:
            return headers, extracted_data
        return headers, structured_data

    async def _wrap_tool_node(self, state: MessagesState):
        """Intercept tool_node results, store them, and inject data_id metadata."""
        global _active_tool_results
        _active_tool_results = self.tool_results

        result = await tool_node.ainvoke(state)
        for msg in result.get("messages", []):
            result_id = str(uuid.uuid4())
            content   = msg.content
            if isinstance(content, str):
                try:
                    structured_data = json.loads(content)
                except (json.JSONDecodeError, TypeError):
                    structured_data = content
            else:
                structured_data = content

            headers, extracted = self._extract_mcp_data(structured_data)
            self.tool_results[result_id] = {
                "tool_name":    getattr(msg, "name", None),
                "tool_call_id": getattr(msg, "tool_call_id", None),
                "data":         extracted,
            }

            extracted_json = json.dumps(extracted)
            if len(extracted_json) > self.MAX_CONTEXT_RESULT_SIZE:
                data_for_llm = self._summarize_json(extracted)
                logger.info(
                    "JSON SUMMARY: Reduced tool result from %d chars to %d chars",
                    len(extracted_json), len(json.dumps(data_for_llm)),
                )
                llm_content = {"data_id": result_id, "info": headers, "summary": data_for_llm}
            else:
                llm_content = {"data_id": result_id, "info": headers, "result": extracted}

            msg.content = json.dumps(llm_content)
        return result

    # -------------------------------------------------------------------------
    # Graph construction
    # -------------------------------------------------------------------------

    def build_agent(self):
        graph_builder = StateGraph(MessagesState)
        graph_builder.add_node("agent",       call_model)
        graph_builder.add_node("tools",       self._wrap_tool_node)
        graph_builder.add_node("visualizer",  visualizer)
        graph_builder.add_node("visual_tool", visualization_tool)
        graph_builder.add_node("output",      output_node)
        graph_builder.add_node("submit_tool", submit_tool)

        graph_builder.add_edge(START, "agent")
        graph_builder.add_conditional_edges("agent",      should_continue)
        graph_builder.add_edge("tools",      "agent")
        graph_builder.add_conditional_edges("visualizer", has_visual)
        graph_builder.add_edge("visual_tool", "output")
        graph_builder.add_edge("output",      "submit_tool")
        graph_builder.add_edge("submit_tool", END)

        return graph_builder.compile(checkpointer=memory)

    def create(self):
        return self.build_agent()