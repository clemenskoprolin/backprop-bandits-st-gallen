import json
import concurrent.futures
from typing import Literal
from uuid import uuid4
from langchain_core.tools import tool
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from dotenv import load_dotenv
from src import db

load_dotenv()

# ---------------------------------------------------------------------------
# Module-level constants and shared stateless resources
# ---------------------------------------------------------------------------

MCP_SERVERS = {
    "mongodb": {
        "url": "http://202.61.251.60:3001/mcp",
        "transport": "streamable_http",
    }
}

llm = ChatAnthropic(model="claude-sonnet-4-6")
memory = MemorySaver()
mcp_tools: list = []

MAX_TOOL_RESULT_CHARS = 6000
_LIST_PREVIEW_LEN = 2


async def init_mcp_client():
    """Initialize the MCP client and load MongoDB tools."""
    try:
        global mcp_tools
        mcp_client = MultiServerMCPClient(MCP_SERVERS)
        mcp_tools = await mcp_client.get_tools()
        print(f"Loaded {len(mcp_tools)} tools from MongoDB MCP server:")
        for t in mcp_tools:
            print(f"  - {t.name}: {t.description[:60]}...")
        return mcp_tools
    except Exception as e:
        raise Exception("Exception occured:", e)


async def shutdown_mcp_client():
    """Shutdown the MCP client."""
    pass


# ---------------------------------------------------------------------------
# Pure helper — no mutable state
# ---------------------------------------------------------------------------

def _summarize_structure(obj, depth=0, max_depth=5):
    """Recursively build a structural summary of a JSON object.

    - Dicts: keep all keys, recurse into values
    - Lists: keep up to _LIST_PREVIEW_LEN items, add a '...(N total)' marker
    - Scalars: keep short values, truncate long strings
    """
    if depth > max_depth:
        return "..."

    if isinstance(obj, dict):
        return {k: _summarize_structure(v, depth + 1, max_depth) for k, v in obj.items()}

    if isinstance(obj, list):
        if not obj:
            return []
        preview = [_summarize_structure(item, depth + 1, max_depth) for item in obj[:_LIST_PREVIEW_LEN]]
        if len(obj) > _LIST_PREVIEW_LEN:
            preview.append(f"...({len(obj)} total)")
        return preview

    if isinstance(obj, str):
        if len(obj) <= 60:
            return obj
        return obj[:57] + "..."
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        return obj

    return str(obj)


def should_continue(state: MessagesState) -> Literal["tools", "output"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "output"


# ---------------------------------------------------------------------------
# Agent class — all mutable state and closures live here
# ---------------------------------------------------------------------------

class Agent:
    def __init__(self, message, similar_text):
        self.message = message
        self.similar_text = similar_text
        self._data_store: dict[str, str] = {}

        # Local refs for closures
        data_store = self._data_store

        similar_data = "you are given the following similar text from a vectordb: " + self.similar_text
        be_professional = "  Be very professional!"

        # ---- System prompts (instance-scoped) ----

        self._system_prompt = """You are Backprop Bandits, an AI material testing assistant with MongoDB database access.
        AVAILABLE TOOLS:

        MongoDB (from MCP server):
        - `find` - Query documents with filters, projection, and sorting
        - `aggregate` - Run aggregation pipelines
        - `collection-schema` - Understand collection structure
        - `list-collections` - See available collections
        - `count` - Count matching documents

        Visualization:
        - `get_aggregated_data_for_chart` - Recharts-formatted aggregations
        - `render_visualization` - Display charts on the UI

        IMPORTANT QUERY RULES:
        - When using `find`, ALWAYS set a `limit` (max 50) and use `projection` to select only the fields you need.

        DATA FLOW — SIDE-CHANNEL STORAGE:
        Large query results are automatically stored server-side to keep the conversation compact.
        When this happens, the tool result you see is a SUMMARY containing:
        - `data_id`: a short ID referencing the full stored dataset
        - `total_documents`: how many documents were returned
        - `document_structure` / `structure`: the shape of the data (keys, types, sample values, truncated lists)
        Use the structure to understand what fields are available, then call `run_python_analysis`
        with the `data_id` parameter to work with the complete dataset. Do NOT try to copy data
        from the summary into `data_json` — just pass the `data_id` and the full data loads automatically.

        ALWAYS call `render_visualization` when showing aggregated or statistical data.
        """ + similar_data

        self._output_system_prompt = """You are a material testing AI assistant.

        Based on the tool results and analysis above:
        1. Write a clear, concise answer to the user's question
        2. After your answer, suggest 3 follow-up hypotheses worth investigating if there are any. Don't always force it.
        """ + similar_data + be_professional

        self._visualizer_system_prompt = """You are Backprop Bandits, an AI material testing assistant.
        You should inspect if the previous results would benefit from a visualization. If you want to visualize
        use the render_visualization function to visualize the data. If not, still call the function with none values.""" + similar_data

        # ---- Tool closures (capture data_store) ----

        @tool
        async def get_aggregated_data_for_chart(
            group_by_field: str,
            aggregations: str,
            match_filters: str = None
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
                agg_dict = json.loads(aggregations) if aggregations else {}
                match_dict = json.loads(match_filters) if match_filters else None
            except json.JSONDecodeError as e:
                return f"Error: Failed to parse JSON arguments: {e}"

            results = await db.aggregate_for_recharts(group_by_field, agg_dict, match_dict)
            return json.dumps(results, default=str)

        @tool
        def render_visualization(chart_type: str, title: str, x_label: str, y_label: str, series_json: str) -> str:
            """
            Render a chart on the user's dashboard.
            ALWAYS call this when displaying aggregated/statistical data.

            Args:
                chart_type: 'Bar'
                title: Chart title.
                x_label: X axis label.
                y_label: Y axis label.
                series_json: Dataset as JSON string from get_aggregated_data_for_chart or formatted data.
            """
            return "Visualization successfully rendered on UI."

        @tool
        def submit_answer(answer: str, hypotheses: list[str]) -> str:
            """
            Always call this tool to submit your final answer and hypotheses.

            Args:
                answer: Clear, concise answer to the user's question
                hypotheses: List of 3 follow-up hypotheses worth investigating. Empty list if none.
            """
            return "Answer submitted."

        @tool
        def run_python_analysis(code: str, data_json: str = "", data_id: str = "") -> str:
            """
            Execute a Python code snippet for statistical analysis on material testing data.

            DATA FLOW: When a query tool (find, aggregate, etc.) returns a large result, the
            system stores the full data server-side and returns a summary with a `data_id`.
            Pass that `data_id` here to access the complete dataset — it will be loaded
            automatically. You do NOT need to pass the raw data through `data_json` when a
            `data_id` is available; the server resolves it for you.

            Use this for: statistical significance tests, trend/degradation analysis,
            outlier detection, correlation analysis, descriptive statistics.

            The execution environment pre-populates:
              - `data`: list of dicts (full dataset resolved from data_id or parsed from data_json)
              - `df`: pandas DataFrame built from data
              - `np`: numpy
              - `pd`: pandas
              - `stats`: scipy.stats

            Assign your final answer to `result`.

            Args:
                code: Python snippet. Must assign `result` to capture output.
                data_json: JSON string (list of dicts) — use only for small inline data.
                data_id: ID from a previous query's stored results (preferred — avoids large data in conversation).

            Returns:
                JSON string with keys "output" (stdout) and "result" (value of `result`).
            """
            from importlib import import_module
            from langchain_experimental.utilities import PythonREPL

            TIMEOUT_SECONDS = 10

            try:
                np = import_module("numpy")
                pd = import_module("pandas")
                stats = import_module("scipy.stats")
            except ModuleNotFoundError as e:
                return json.dumps({
                    "error": f"Missing analysis dependency: {e.name}",
                    "output": "",
                    "result": None,
                })

            # Resolve data from side channel if data_id provided
            if data_id and data_id in data_store:
                data_json = data_store[data_id]

            try:
                parsed_data = json.loads(data_json) if data_json else []
            except json.JSONDecodeError as e:
                return json.dumps({"error": f"Failed to parse data_json: {e}", "output": "", "result": None})

            repl = PythonREPL()
            repl.globals.update({
                "np": np,
                "pd": pd,
                "stats": stats,
                "data": parsed_data,
                "df": pd.DataFrame(parsed_data) if parsed_data else pd.DataFrame(),
                "result": None,
            })

            def _execute():
                return repl.run(code)

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(_execute)
                    output = future.result(timeout=TIMEOUT_SECONDS)
            except concurrent.futures.TimeoutError:
                return json.dumps({
                    "error": f"Execution timed out after {TIMEOUT_SECONDS} seconds.",
                    "output": "",
                    "result": None,
                })
            except Exception as e:
                return json.dumps({
                    "error": f"Execution error: {type(e).__name__}: {e}",
                    "output": "",
                    "result": None,
                })

            raw_result = repl.globals.get("result") or repl.locals.get("result")
            try:
                serialized_result = json.loads(json.dumps(raw_result, default=str))
            except Exception:
                serialized_result = str(raw_result)

            return json.dumps({
                "output": output,
                "result": serialized_result,
            })

        @tool
        def remove_widget(widget_id: str, reason: str = "") -> str:
            """
            Remove a widget from the user's dashboard.
            Use this when the user asks to remove, delete, or clear a specific chart/widget.

            Args:
                widget_id: The widget ID to remove (from the CURRENT DASHBOARD STATE context).
                reason: Brief reason for removal.
            """
            return f"Widget {widget_id} removed from dashboard."


        @tool
        def reorder_dashboard(widget_ids: list[str]) -> str:
            """
            Reorder widgets on the user's dashboard. Provide the widget IDs in the desired order.
            Widgets will be reflowed in a grid layout in this order.
            Use this when the user asks to rearrange, reorder, or reorganize their dashboard.

            Args:
                widget_ids: List of widget IDs in the desired display order (from the CURRENT DASHBOARD STATE context).
            """
            return f"Dashboard reordered with {len(widget_ids)} widgets."

        # ---- Build tool collections and LLM bindings (instance-scoped) ----

        custom_tools = [get_aggregated_data_for_chart, run_python_analysis]
        all_tools = custom_tools + mcp_tools
        self._tool_node = ToolNode(all_tools)
        self._dashboard_tools = [render_visualization, remove_widget, reorder_dashboard]
        self._visualization_tool = ToolNode(self._dashboard_tools)
        self._submit_tool = ToolNode([submit_answer])
        self._llm_with_tools = llm.bind_tools(all_tools)
        self._llm_visualizer = llm.bind_tools(self._dashboard_tools)
        self._llm_output = llm.bind_tools([submit_answer], tool_choice="submit_answer")

        # ---- Graph node closures (capture self's prompts and tools) ----

        async def _tools_with_side_channel(state: MessagesState):
            """Run tools, store large results in side channel, return compact summaries."""
            result = await self._tool_node.ainvoke(state)
            for msg in result.get("messages", []):
                if not (hasattr(msg, "content") and isinstance(msg.content, str)):
                    continue
                content = msg.content
                if len(content) <= MAX_TOOL_RESULT_CHARS:
                    continue
                # Try to parse as JSON and store in side channel
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, (list, dict)):
                        did = uuid4().hex[:8]
                        data_store[did] = content

                        summary = {"data_id": did}
                        if isinstance(parsed, list):
                            summary["total_documents"] = len(parsed)
                            if parsed:
                                summary["document_structure"] = _summarize_structure(parsed[0])
                        else:
                            summary["structure"] = _summarize_structure(parsed)

                        summary["note"] = (
                            "This is a SUMMARY — the full query result was too large to include in the conversation. "
                            "The 'document_structure'/'structure' field shows the shape of the data with truncated lists and sample values. "
                            "The complete data is stored server-side. "
                            "To work with the full dataset, call run_python_analysis with this data_id — "
                            "it will load all documents automatically into `data` (list of dicts) and `df` (DataFrame)."
                        )
                        msg.content = json.dumps(summary, default=str)
                        print(f"[side-channel] Stored data as data_id={did} ({len(content)} chars → {len(msg.content)} chars)")
                        continue
                except (json.JSONDecodeError, TypeError):
                    pass
                # Fallback: plain truncation for non-JSON large results
                original_len = len(content)
                msg.content = content[:MAX_TOOL_RESULT_CHARS] + (
                    f"\n\n[TRUNCATED — {MAX_TOOL_RESULT_CHARS}/{original_len} chars shown. "
                    "Use more specific filters or projections to narrow results.]"
                )
            return result

        def _call_model(state: MessagesState):
            messages = state["messages"]
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=self._system_prompt)] + messages
            response = self._llm_with_tools.invoke(messages)
            return {"messages": [response]}

        def _output_node(state: MessagesState):
            messages = state["messages"]
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=self._output_system_prompt)] + messages
            # Trim history: keep system + user question + last 6 messages to reduce token usage
            if len(messages) > 8:
                messages = messages[:2] + messages[-6:]
            messages = messages + [HumanMessage(content="Given the current conversation, summarize to an answer.")]
            response = self._llm_output.invoke(messages)
            return {"messages": [response]}

        def _visualizer(state: MessagesState):
            messages = state["messages"]
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=self._visualizer_system_prompt)] + messages
            messages = messages + [HumanMessage(content="Based on the results, decide if visualization is needed.")]
            response = self._llm_visualizer.invoke(messages)
            return {"messages": [response]}

        # Expose closures as instance attributes used by the graph builder.
        self._tools_with_side_channel = _tools_with_side_channel
        self._call_model = _call_model
        self._output_node = _output_node
        self._visualizer = _visualizer

    def build_agent(self):
        """Build the agent graph. Called after MCP tools are initialized."""
        graph_builder = StateGraph(MessagesState)
        graph_builder.add_node("agent", self._call_model)
        graph_builder.add_node("tools", self._tools_with_side_channel)
        graph_builder.add_node("visualizer", self._visualizer)
        graph_builder.add_node("visual_tool", self._visualization_tool)
        graph_builder.add_node("output", self._output_node)
        graph_builder.add_node("submit_tool", self._submit_tool)
        graph_builder.add_edge(START, "agent")
        graph_builder.add_conditional_edges("agent", should_continue)
        graph_builder.add_edge("tools", "agent")
        graph_builder.add_conditional_edges("visualizer", has_visual)
        graph_builder.add_edge("visual_tool", "output")
        graph_builder.add_edge("output", "submit_tool")
        graph_builder.add_edge("submit_tool", END)
        return graph_builder.compile(checkpointer=memory)

    def create(self):
        agent = self.build_agent()
        return agent

def has_visual(state: MessagesState) -> Literal["visual_tool", "output"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "visual_tool"
    return "output"
