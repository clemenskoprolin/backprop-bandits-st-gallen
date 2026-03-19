import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Ensure `backend/` is on sys.path so `routers.*` imports work when uvicorn
# is invoked as `uvicorn backend.main:app` from the project root.
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, feedback, upload
from src.agent import init_mcp_client, shutdown_mcp_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize MCP client on startup, shutdown on exit."""
    try:
        await init_mcp_client()
        print("MongoDB MCP client initialized")
    except Exception as e:
        print(f"Failed to initialize MCP client: {e}")
        print("Continuing without MCP tools...")

    yield

    await shutdown_mcp_client()
    print("MongoDB MCP client shutdown")


app = FastAPI(title="Backprop Bandits — Material Testing AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(feedback.router)
app.include_router(upload.router)


@app.get("/")
def read_root():
    return {"status": "ok"}
