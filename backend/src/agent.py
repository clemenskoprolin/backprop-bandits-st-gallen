import base64
import json
import concurrent.futures
from typing import Literal
from langchain_core.tools import tool
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from dotenv import load_dotenv
from src import db
from langchain_core.messages import trim_messages

load_dotenv()

# MCP Server Configuration - Streamable HTTP transport (Docker)
# credentials = base64.b64encode(b"admin:olmamessen1st").decode()

# MCP_SERVERS = {
#     "mongodb": {
#         "url": "https://test.koprolin.com/mcp",
#         "transport": "streamable_http",
#         "headers": {
#             "Authorization": f"Basic {credentials}"
#         }
#     }
# }

MCP_SERVERS = {
    "mongodb": {
        "url": "http://202.61.251.60:3001/mcp",
        "transport": "streamable_http",
    }
}

# # Global MCP client (initialized via lifespan)
# mcp_client: MultiServerMCPClient = None
# mcp_tools: list = []

@tool
async def get_sample_documents() -> str:
    """Returns sample documents from a collection as a string"""

    results = await db.get_sample_documents()
    return json.dumps(results, default=str)



# Custom tool for Recharts-formatted aggregations (MCP's aggregate is generic)
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
def render_visualization(chart_type: str, title: str, x_axis_key: str, data_json: str, chart_config_json: str, description: str = "") -> str:
    """
    Render a chart on the user's dashboard.
    ALWAYS call this when displaying aggregated/statistical data.

    Args:
        chart_type: One of 'bar', 'area', 'line', 'pie', 'radar', 'radial'.
        title: Chart title.
        x_axis_key: The key in data records used for the x-axis / category labels (e.g. 'date', 'material', 'name').
        data_json: JSON string of FLAT records array. Each record is an object with the x_axis_key and one or more numeric series keys.
            Example: '[{"date": "2024-01", "tensile_strength": 420, "yield_strength": 380}, {"date": "2024-02", "tensile_strength": 435, "yield_strength": 390}]'
            For pie charts: '[{"name": "Material A", "value": 42}, {"name": "Material B", "value": 58}]'
        chart_config_json: JSON string defining series metadata. Keys are the series data keys, values have 'label' and 'color'.
            Color can be a CSS color name (e.g. "red", "blue"), hex (e.g. "#ff0000"), or theme token (e.g. "var(--chart-1)").
            If the user mentions specific colors, use those exact CSS color names.
            Example: '{"tensile_strength": {"label": "Tensile Strength (MPa)", "color": "var(--chart-1)"}, "yield_strength": {"label": "Yield Strength (MPa)", "color": "var(--chart-2)"}}'
            For pie charts with user-specified colors: '{"value": {"label": "Count"}}' and set "fill" in data_json: '[{"name": "Red", "value": 50, "fill": "red"}, {"name": "Blue", "value": 50, "fill": "blue"}]'
        description: Optional short description shown below the title.
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
def run_python_analysis(code: str, data_json: str) -> str:
    """
    Execute a Python code snippet for statistical analysis on material testing data.

    Use this for: statistical significance tests, trend/degradation analysis,
    outlier detection, correlation analysis, descriptive statistics.

    The execution environment pre-populates:
      - `data`: list of dicts parsed from data_json
      - `df`: pandas DataFrame built from data
      - `np`: numpy
      - `pd`: pandas
      - `stats`: scipy.stats

    Assign your final answer to `result`.

    Args:
        code: Python snippet. Must assign `result` to capture output.
        data_json: JSON string (list of dicts) from a `find` or `aggregate` call.

    Returns:
        JSON string with keys "output" (stdout) and "result" (value of `result`).
    """
    import numpy as np
    import pandas as pd
    from scipy import stats
    from langchain_experimental.utilities import PythonREPL

    TIMEOUT_SECONDS = 10

    try:
        data = json.loads(data_json) if data_json else []
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"Failed to parse data_json: {e}", "output": "", "result": None})

    repl = PythonREPL()
    repl.globals.update({
        "np": np,
        "pd": pd,
        "stats": stats,
        "data": data,
        "df": pd.DataFrame(data) if data else pd.DataFrame(),
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


# Custom tools (Recharts-specific, kept alongside MCP tools)
custom_tools = [get_aggregated_data_for_chart, run_python_analysis]
tool_node = ToolNode(custom_tools)
visualization_tool = ToolNode([render_visualization])
submit_tool = ToolNode([submit_answer])

# llm = ChatAnthropic(model="claude-sonnet-4-6")
llm = ChatAnthropic(model="claude-haiku-4-5-20251001")
llm_with_tools = llm.bind_tools(custom_tools)
llm_visualizer = llm.bind_tools([render_visualization])
llm_output = llm.bind_tools([submit_answer], tool_choice="submit_answer")

# Will be rebound after MCP tools are loaded
_all_tools = custom_tools.copy()


async def init_mcp_client():
    try:
        """Initialize the MCP client and load MongoDB tools."""
        global mcp_client, mcp_tools, _all_tools, tool_node, llm_with_tools, agent

        mcp_client = MultiServerMCPClient(MCP_SERVERS)

        # New API: get_tools() is async and handles connection internally
        mcp_tools = await mcp_client.get_tools()
        print(f"Loaded {len(mcp_tools)} tools from MongoDB MCP server:")
        for t in mcp_tools:
            print(f"  - {t.name}: {t.description[:60]}...")

        # Combine custom tools with MCP tools
        _all_tools = custom_tools + mcp_tools
        tool_node = ToolNode(_all_tools)
        llm_with_tools = llm.bind_tools(_all_tools)



        return mcp_tools
    except Exception as e:
        raise Exception("Exception occured:", e)


async def shutdown_mcp_client():
    """Shutdown the MCP client."""
    global mcp_client
    # New API doesn't require explicit cleanup
    mcp_client = None



# system_prompt = """You are Backprop Bandits, an AI material testing assistant with MongoDB database access.

# AVAILABLE TOOLS:

# MongoDB (from MCP server):
# - `find` - Query documents with filters, projection, and sorting
# - `aggregate` - Run aggregation pipelines
# - `collection-schema` - Understand collection structure
# - `list-collections` - See available collections
# - `count` - Count matching documents

# Visualization:
# - `get_aggregated_data_for_chart` - Recharts-formatted aggregations
# - `render_visualization` - Display charts on the UI

# Statistical Analysis:
# - `run_python_analysis` - Execute Python (numpy/pandas/scipy) on retrieved data

# WORKFLOW FOR STATISTICAL QUESTIONS:
# 1. Use `find` or `aggregate` to retrieve raw data as a JSON list.
# 2. Pass that JSON string directly into `run_python_analysis` as `data_json`.
# 3. Write a Python snippet that assigns the final answer to `result`.
# 4. Use the returned `result` to compose your natural-language answer.

# Example — significance test between two groups:
#   code = \"\"\"
#   group_a = [r['TestParametersFlat']['Upper force limit'] for r in data if r.get('TestParametersFlat', {}).get('CUSTOMER') == 'Company_A']
#   group_b = [r['TestParametersFlat']['Upper force limit'] for r in data if r.get('TestParametersFlat', {}).get('CUSTOMER') == 'Company_B']
#   t, p = stats.ttest_ind(group_a, group_b)
#   result = {'t_statistic': float(t), 'p_value': float(p), 'significant': bool(p < 0.05)}
#   \"\"\"

# Example — trend / degradation over time:
#   code = \"\"\"
#   vals = [r['TestParametersFlat'].get('Upper force limit') for r in data if r.get('TestParametersFlat', {}).get('Upper force limit') is not None]
#   x = np.arange(len(vals))
#   slope, _, _, p, _ = stats.linregress(x, vals)
#   result = {'slope': float(slope), 'p_value': float(p), 'trend': 'decreasing' if slope < 0 else 'stable/increasing'}
#   \"\"\"

# ALWAYS call `render_visualization` when showing aggregated or statistical data.
# """

# output_system_prompt = """You are a material testing AI assistant.

# Based on the tool results and analysis above:
# 1. Write a clear, concise answer to the user's question
# 2. After your answer, suggest 2-3 follow-up hypotheses worth investigating if there are any. Don't always force it.
# """

# intermediate_output_system_prompt = """briefly summarize the findings
# """

# self_critic_system_prompt = critic_system_prompt = """You are a critical reviewer of material testing analysis.

# Review the previous conversation history and output ONLY a JSON object:
# {
#   "verdict": "accept|retry",
#   "confidence": "high|medium|low",
#   "text": "The verdict you made and why you made this verdict",
#   "missing_data": "what tool should be called to improve the answer, or null",
#   "tool_to_call": "search_tests|get_aggregated_data_for_chart|null",
#   "tool_args": {...} or null,
#   "caveats": ["caveat 1", "caveat 2"]
# }

# Verdict rules:
# - accept: answer is well supported by data
# - retry: answer needs more data, specify which tool to call
# - escalate: query is too complex, needs deeper analysis
# """

# visualizer_system_prompt = """You are Backprop Bandits, an AI material testing assistant.
# You should inspect if the previous results would benefit from a visualization. If you want to visualize
# use the render_visualization function to visualize the data. If not, still call the function with none values."""

def call_model(state: MessagesState):
    messages = state['messages']
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=system_prompt)] + messages
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def should_continue(state: MessagesState) -> Literal["tools", "output"]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "output"


def output_node(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=output_system_prompt)] + messages
    # Claude requires conversation to end with a user message after tool results
    messages = messages + [HumanMessage(content="Given the current conversation, summarize to an answer.")]
    response = llm_output.invoke(messages)
    return {"messages": [response]}

# def self_critic(state: MessagesState):
#     global global_count
#     messages = state["messages"]
#     # if not messages or messages[0].type != "system":
#     messages = [SystemMessage(content=self_critic_system_prompt)] + messages

#     response = llm_with_tools.invoke(messages)
#     global_count += 1
#     return {"messages": [response]}

# def loop_node(state: MessagesState) -> Literal["tools", "output"]:
#     messages = state["messages"]
#     last_message = messages[-1]
#     print("Last:", last_message)  # ← .content not .text


    # try:
    #     import json
    #     critique = json.loads(last_message.content)
    #     print("Verdict:", critique["verdict"])
    #     if critique["verdict"] == "retry":
    #         return "output"
    #     else:
    #         return "output"
    # except Exception as e:
    #     print("Parse error:", e)
    #     return "output"


# def intermediate_output_node(state: MessagesState):
#     global global_count
#     messages = state["messages"]
#     if not messages or messages[0].type != "system":
#         messages = [SystemMessage(content=output_system_prompt)] + messages

#     response = llm_with_tools.invoke(messages)
#     global_count += 1
#     return {"messages": [response]}

def visualizer(state: MessagesState):
    messages = state['messages']
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=visualizer_system_prompt)] + messages
    # Claude requires conversation to end with a user message
    messages = messages + [HumanMessage(content="Based on the results, decide if visualization is needed and use render_visualization function to visualize.")]
    response = llm_visualizer.invoke(messages)
    print("hi",response)
    return {"messages": [response]}

def has_visual(state: MessagesState) -> Literal["visual_tool", "output"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "visual_tool"
    return "output"

memory = MemorySaver()

system_prompt = ""
output_system_prompt = ""
visualizer_system_prompt = ""
self_critic_system_prompt = ""

class Agent:
    def __init__(self, message, similar_text):
        self.message = message
        self.similar_text = similar_text
        similar_data = "you are given the following similar text from a vectordb: " + self.similar_text

        be_professional = "Be very professional!"

        global system_prompt, output_system_prompt, visualizer_system_prompt, self_critic_system_prompt

        uuid = """UUIDs
        In many areas of the Data you will stumble upon UUIDs. We tried to migrate them as best we could, but on some places they are still integral.

        Valuecolumns
        this is the propably biggest source for UUIDs. The structure of a valucolumn entry, consist of two important metadatas: refId and childId

        refId is a reference to the source test _id
        childId is id constructed by the `[test.valuecolumns._id].[test.valuecolumn.valuetableId]
        The UUIDs in childId is a reference to the type of value stored there. In the repository you will find files containing translations for these UUIDs, as well as the possible unittables.
        for Results (valuecolumn has only a single value), take a look at the file TestResultTypes
        for Measurements, take a look at the channelParameterMap
        some test.valuecolumn._id end with a _key - they can be safely ignored and weren't migrated into this test dataset"""

        system_prompt = """You are Backprop Bandits, an AI material testing assistant with MongoDB database access.
        AVAILABLE TOOLS:

        MongoDB (from MCP server):
        - `find` - Query documents with filters, projection, and sorting
        - `aggregate` - Run aggregation pipelines
        - `collection-schema` - Understand collection structure
        - `list-collections` - See available collections
        - `count` - Count matching documents

        Visualization:
        - `get_aggregated_data_for_chart` - Recharts-formatted aggregations
        - `render_visualization` - Display charts on the UI (supports: bar, area, line, pie, radar, radial)

        ALWAYS call `render_visualization` when showing aggregated or statistical data.
        Data format for render_visualization must be FLAT records: [{"label": "A", "value1": 10, "value2": 20}, ...]
        """ + similar_data

        output_system_prompt = """You are a material testing AI assistant.

        Based on the tool results and analysis above:
        1. Write a clear, concise answer to the user's question
        2. After your answer, suggest 3 follow-up hypotheses worth investigating if there are any. Don't always force it.
        """ + similar_data + be_professional

        intermediate_output_system_prompt = """briefly summarize the findings
        """ + similar_data

        self_critic_system_prompt = """You are a critical reviewer of material testing analysis.

        Review the previous conversation history and output ONLY a JSON object:
        {
        "verdict": "accept|retry",
        "confidence": "high|medium|low",
        "text": "The verdict you made and why you made this verdict",
        "missing_data": "what tool should be called to improve the answer, or null",
        "tool_to_call": "search_tests|get_aggregated_data_for_chart|null",
        "tool_args": {...} or null,
        "caveats": ["caveat 1", "caveat 2"]
        }

        Verdict rules:
        - accept: answer is well supported by data
        - retry: answer needs more data, specify which tool to call
        - escalate: query is too complex, needs deeper analysis
        """ + similar_data

        visualizer_system_prompt = """You are Backprop Bandits, an AI material testing assistant.
        You should inspect if the previous results would benefit from a visualization. If you want to visualize
        use the render_visualization function to visualize the data. Visualize if possible!
        Render a chart on the user's dashboard.
        ALWAYS call this when displaying aggregated/statistical data.

        Supported chart types: 'bar', 'area', 'line', 'pie', 'radar', 'radial'.

        IMPORTANT: data_json must be FLAT records. Each record is a plain object with a label/category key and numeric value keys.
        Example for bar/line/area: [{"material": "Steel A", "tensile_strength": 420, "yield_strength": 380}, ...]
        Example for pie: [{"name": "Material A", "value": 42}, {"name": "Material B", "value": 58}]

        chart_config_json maps each numeric key to its display label and color:
        {"tensile_strength": {"label": "Tensile Strength (MPa)", "color": "var(--chart-1)"}, "yield_strength": {"label": "Yield Strength (MPa)", "color": "var(--chart-2)"}}

        Use var(--chart-1) through var(--chart-5) for default colors.
        If the user mentions specific colors (e.g. "red and blue"), use those CSS color names directly.
        For pie/radial charts, set "fill" on each data record: [{"name": "Red", "value": 50, "fill": "red"}]
        If not, still call the function with none values.""" + similar_data


    def build_agent(self):
        """Build the agent graph. Called after MCP tools are initialized."""
        graph_builder = StateGraph(MessagesState)
        graph_builder.add_node("agent", call_model)
        graph_builder.add_node("tools", tool_node)
        graph_builder.add_node("visualizer", visualizer)
        graph_builder.add_node("visual_tool", visualization_tool)
        graph_builder.add_node("output", output_node)
        graph_builder.add_node("submit_tool", submit_tool)
        graph_builder.add_edge(START, "visualizer")
        # graph_builder.add_conditional_edges("agent", should_continue)
        # graph_builder.add_edge("tools", "visualizer")
        graph_builder.add_conditional_edges("visualizer", has_visual)
        graph_builder.add_edge("visual_tool", "output")
        graph_builder.add_edge("output", "submit_tool")
        graph_builder.add_edge("submit_tool", END)
        return graph_builder.compile(checkpointer=memory)

    def create(self):
        agent = self.build_agent()
        return agent
