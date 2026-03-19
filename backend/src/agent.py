import json
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

load_dotenv()

# MCP Server Configuration - Streamable HTTP transport (Docker)
MCP_SERVERS = {
    "mongodb": {
        "url": "http://202.61.251.60:3001/mcp",
        "transport": "streamable_http"
    }
}

# Global MCP client (initialized via lifespan)
mcp_client: MultiServerMCPClient = None
mcp_tools: list = []

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
def render_visualization(chart_type: str, title: str, x_label: str, y_label: str, series_json: str) -> str:
    """
    Render a chart on the user's dashboard.
    ALWAYS call this when displaying aggregated/statistical data.

    Args:
        chart_type: 'bar', 'line', 'pie', etc.
        title: Chart title.
        x_label: X axis label.
        y_label: Y axis label.
        series_json: Dataset as JSON string from get_aggregated_data_for_chart or formatted data.
    """
    return "Visualization successfully rendered on UI."


# Custom tools (Recharts-specific, kept alongside MCP tools)
custom_tools = [get_aggregated_data_for_chart]
tool_node = ToolNode(custom_tools)
visualization_tool = ToolNode([render_visualization])

llm = ChatAnthropic(model="claude-sonnet-4-6")
llm_with_tools = llm.bind_tools(custom_tools)
llm_visualizer = llm.bind_tools([render_visualization])

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

        # Rebuild the agent with new tools
        # agent = build_agent()
        print("Agent rebuilt with MCP tools")

        return mcp_tools
    except Exception as e:
        raise Exception("Exception occured:", e)


async def shutdown_mcp_client():
    """Shutdown the MCP client."""
    global mcp_client
    # New API doesn't require explicit cleanup
    mcp_client = None


def call_model(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=system_prompt)] + messages
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def should_continue(state: MessagesState) -> Literal["tools", END]:
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END


def output_node(state: MessagesState):
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=output_system_prompt)] + messages
    # Claude requires conversation to end with a user message after tool results
    messages = messages + [HumanMessage(content="Given the current conversation, summarize to an answer.")]
    response = llm.invoke(messages)
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
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=visualizer_system_prompt)] + messages
    # Claude requires conversation to end with a user message
    messages = messages + [HumanMessage(content="Based on the results, decide if visualization is needed.")]
    response = llm_visualizer.invoke(messages)
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
        
        global system_prompt, output_system_prompt, visualizer_system_prompt, self_critic_system_prompt
        
        be_professional = "  Be very professional!"

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
        - `render_visualization` - Display charts on the UI

        ALWAYS call `render_visualization` when showing aggregated or statistical data.
        """ + similar_data + be_professional

        output_system_prompt = """You are a material testing AI assistant.

        Based on the tool results and analysis above:
        1. Write a clear, concise answer to the user's question
        2. After your answer, suggest 2-3 follow-up hypotheses worth investigating if there are any. Don't always force it.
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
        """ + similar_data + be_professional

        visualizer_system_prompt = """You are Backprop Bandits, an AI material testing assistant.
        You should inspect if the previous results would benefit from a visualization. If you want to visualize
        use the render_visualization function to visualize the data. If not, still call the function with none values.""" + similar_data + be_professional


    def build_agent(self):
        """Build the agent graph. Called after MCP tools are initialized."""
        graph_builder = StateGraph(MessagesState)
        graph_builder.add_node("agent", call_model)
        graph_builder.add_node("tools", tool_node)
        graph_builder.add_node("visualizer", visualizer)
        graph_builder.add_node("visual_tool", visualization_tool)
        graph_builder.add_node("output", output_node)
        graph_builder.add_edge(START, "agent")
        graph_builder.add_conditional_edges("agent", should_continue)
        graph_builder.add_edge("tools", "visualizer")
        graph_builder.add_edge("visualizer", "visual_tool")
        graph_builder.add_edge("visual_tool", "output")
        graph_builder.add_edge("output", END)
        return graph_builder.compile(checkpointer=memory)
    
    def create(self):
        agent = self.build_agent()
        return agent



# Initial agent (rebuilt on startup with MCP tools)
