import asyncio
from src.agent import Agent, init_mcp_client, shutdown_mcp_client

QUERIES = [
    "Show me the average upper force limit by customer."
]


def print_tool_calls(messages):
    for msg in messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                print(f"  [TOOL CALLED] {tc['name']} — args: {list(tc['args'].keys())}")


async def main():
    await init_mcp_client()

    for i, query in enumerate(QUERIES):
        print(f"\n{'='*60}")
        print(f"QUERY: {query}")
        print('='*60)

        agent = Agent(message=query, similar_text="").create()

        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": query}]},
            config={"configurable": {"thread_id": f"test-{i}"}}
        )

        print_tool_calls(result["messages"])

        last = result["messages"][-1]
        print(f"\nRESPONSE: {last.content}")

    await shutdown_mcp_client()


asyncio.run(main())