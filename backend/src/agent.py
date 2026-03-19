import json
from typing import Literal
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.prebuilt import ToolNode
from dotenv import load_dotenv
from src import db
from langchain_core.messages import SystemMessage, HumanMessage
load_dotenv()

@tool
async def get_test(test_id: str) -> str:
    """Get the full details of a specific test by its ID."""
    test = await db.get_test(test_id)
    if not test:
        return f"Test with ID {test_id} not found."
    test["_id"] = str(test["_id"])
    return json.dumps(test, default=str)

@tool
async def search_tests(app_type: str = None, state: str = None, limit: int = 10) -> str:
    """Search for tests based on basic metadata filters."""
    filters = {}
    if app_type:
        filters["clientAppType"] = app_type
    if state:
        filters["state"] = state
    tests = await db.search_tests(filters, limit)
    for t in tests:
        t["_id"] = str(t["_id"])
    return json.dumps(tests, default=str)

@tool
async def get_aggregated_data_for_chart(
    group_by_field: str,
    aggregations: str,
    match_filters: str = None
) -> str:
    """
    Get aggregated test data formatted nicely for Recharts visualization.
    Returns JSON string representing array of objects: [{"name": "Group A", "value1": 10}, {"name": "Group B", "value1": 20}]
    
    Args:
        group_by_field: MongoDB document path to group by. Example: "$TestParametersFlat.SPECIMEN_TYPE"
        aggregations: JSON string of MongoDB aggregation operations. Example: '{"avgForce": {"$avg": "$TestParametersFlat.Upper force limit"}}'
        match_filters: Optional JSON string of MongoDB match filters to apply before aggregating. Example: '{"state": "finishedOK"}'
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
    Call this tool to render a chart or visualization on the user's dashboard! 
    ALWAYS call this tool if the user asks for a visualization or if you are displaying aggregated statistical data.
    
    Args:
        chart_type: 'bar', 'line', 'pie', etc.
        title: Title of the chart.
        x_label: Label for the X axis.
        y_label: Label for the Y axis.
        series_json: A JSON string representing the dataset. This should ideally be the exact string returned by `get_aggregated_data_for_chart`, or manually formatted data like: '[{"label": "Material A", "value": 10}, {"label": "Material B", "value": 20}]'
    """
    return "Visualization successfully rendered on UI."

tools = [get_test, search_tests, get_aggregated_data_for_chart]
tool_node = ToolNode(tools)
visualization_tool = ToolNode([render_visualization])

llm = ChatAnthropic(model="claude-sonnet-4-6")
llm_with_tools = llm.bind_tools(tools)
llm_visualizer = llm.bind_tools([render_visualization])

system_prompt = """You are Backprop Bandits, an AI material testing assistant. You have access to a MongoDB test results database.
You can query for individual test records or search for subsets of tests.
If the user wants aggregates or statistics, use `get_aggregated_data_for_chart` which uses MongoDB aggregations.
If the user asks to visualize the data, ALWAYS call the `render_visualization` tool to show it to them.
"""

output_system_prompt = """You are a material testing AI assistant.

Based on the tool results and analysis above:
1. Write a clear, concise answer to the user's question
2. After your answer, suggest 2-3 follow-up hypotheses worth investigating if there are any. Don't always force it.
"""

intermediate_output_system_prompt = """briefly summarize the findings
"""

self_critic_system_prompt = critic_system_prompt = """You are a critical reviewer of material testing analysis.

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
"""

visualizer_system_prompt = """You are Backprop Bandits, an AI material testing assistant. 
You should inspect if the previous results would benefit from a visualization. If you want to visualize
use the render_visualization function to visualize the data. If not, still call the function with none values."""

global_count = 0
def call_model(state: MessagesState):
    global global_count
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=system_prompt)] + messages
        
    response = llm_with_tools.invoke(messages)
    global_count += 1
    return {"messages": [response]}

def should_continue(state: MessagesState) -> Literal["tools", END]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "tools"
    return END

def output_node(state: MessagesState):
    global global_count
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        messages = [SystemMessage(content=output_system_prompt)] + messages
        
    response = llm.invoke(messages)
    global_count += 1
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
    global global_count
    messages = state["messages"]
    if not messages or messages[0].type != "system":
        print("hisafdjsaldjflsakj")
        messages = [SystemMessage(content=visualizer_system_prompt)] + messages
        
    response = llm_visualizer.invoke(messages)
    global_count += 1
    return {"messages": [response]}

def has_visual(state: MessagesState) -> Literal["visual_tool", "output"]:
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "visual_tool"
    return "output"

# graph_builder = StateGraph(MessagesState)
# graph_builder.add_node("agent", call_model)
# graph_builder.add_node("tools", tool_node)
# graph_builder.add_node("critic", self_critic)
# graph_builder.add_node("loop", loop_node)
# graph_builder.add_node("intermediate", intermediate_output_node)
# graph_builder.add_node("output", output_node)
# graph_builder.add_edge(START, "agent")
# graph_builder.add_conditional_edges("agent", should_continue)
# graph_builder.add_edge("tools", "intermediate")
# graph_builder.add_edge("intermediate","critic")
# graph_builder.add_conditional_edges("critic", loop_node)
# graph_builder.add_edge("output", END)

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


from langgraph.checkpoint.memory import MemorySaver

memory = MemorySaver()
agent = graph_builder.compile(checkpointer=memory)