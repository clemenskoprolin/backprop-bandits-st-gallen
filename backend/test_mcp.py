#!/usr/bin/env python3
"""Test script for MCP integration and chat agent."""

import asyncio
import json
import httpx


async def test_mcp_server():
    """Test if MCP server is responding via Streamable HTTP transport."""
    print("Testing MCP Server (Streamable HTTP)...")
    try:
        async with httpx.AsyncClient() as client:
            # Streamable HTTP requires SSE headers and initialization first
            headers = {
                "Content-Type": "application/json",
                "Accept": "text/event-stream, application/json",
            }

            # First: Initialize the MCP session
            init_response = await client.post(
                "http://localhost:3000/mcp",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "test-client", "version": "1.0.0"}
                    }
                },
                headers=headers,
                timeout=10.0
            )

            if init_response.status_code != 200:
                print(f"  ✗ MCP init returned {init_response.status_code}: {init_response.text[:200]}")
                return False

            # Parse SSE response to get session ID
            session_id = init_response.headers.get("mcp-session-id")
            if session_id:
                headers["mcp-session-id"] = session_id

            # Now list tools
            response = await client.post(
                "http://localhost:3000/mcp",
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                headers=headers,
                timeout=10.0
            )

            if response.status_code == 200:
                # Parse SSE response - look for data lines
                tools = []
                for line in response.text.split("\n"):
                    if line.startswith("data:"):
                        try:
                            data = json.loads(line[5:].strip())
                            if "result" in data and "tools" in data["result"]:
                                tools = data["result"]["tools"]
                                break
                        except json.JSONDecodeError:
                            continue

                print(f"  ✓ MCP server responding with {len(tools)} tools")
                for tool in tools[:5]:
                    print(f"    - {tool['name']}")
                if len(tools) > 5:
                    print(f"    ... and {len(tools) - 5} more")
                return True
            else:
                print(f"  ✗ MCP server returned {response.status_code}: {response.text[:200]}")
                return False
    except Exception as e:
        print(f"  ✗ MCP server not reachable: {e}")
        return False


async def test_backend():
    """Test if backend is responding."""
    print("\nTesting Backend...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/", timeout=5.0)
            if response.status_code == 200:
                print("  ✓ Backend is running")
                return True
            else:
                print(f"  ✗ Backend returned {response.status_code}")
                return False
    except Exception as e:
        print(f"  ✗ Backend not reachable: {e}")
        return False


async def test_chat(message: str = "List all collections in the database"):
    """Test the chat endpoint."""
    print(f"\nTesting Chat with: '{message}'")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:8000/api/chat",
                json={"message": message},
                timeout=60.0
            )
            if response.status_code == 200:
                data = response.json()
                print(f"  ✓ Chat responded")
                print(f"  Response preview: {str(data)[:200]}...")
                return True
            else:
                print(f"  ✗ Chat returned {response.status_code}: {response.text}")
                return False
    except Exception as e:
        print(f"  ✗ Chat failed: {e}")
        return False


async def main():
    print("=" * 50)
    print("MCP Integration Test")
    print("=" * 50)

    mcp_ok = await test_mcp_server()
    backend_ok = await test_backend()

    if mcp_ok and backend_ok:
        await test_chat()
    else:
        print("\n⚠ Fix the above issues before testing chat.")

    print("\n" + "=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
