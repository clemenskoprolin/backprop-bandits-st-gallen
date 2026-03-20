# CoMat — Backend API

Core orchestration service. Receives natural language queries, builds LLM context, generates and validates database queries, executes them via MCP, and streams structured responses (SSE) to the frontend.

Built with Python 3.13, FastAPI, LangChain, and the Anthropic Claude API.

## Setup

```bash
uv sync
uvicorn backend.main:app --reload
```

Runs at [http://localhost:8000](http://localhost:8000) by default.

## Environment

Create a `.env` file in this directory:

```env
ANTHROPIC_API_KEY=sk-ant-xxx
```

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Anthropic API key |
| `MCP_URL` | `http://localhost:3001/mcp` | MongoDB MCP server endpoint |
| `RAG_URL` | `http://localhost:3002` | RAG service endpoint |
| `UPLOAD_DIR` | `./uploads` | File upload directory |

## Key Structure

```
backend/
├── main.py           # FastAPI app entry point
├── routers/
│   ├── chat.py       # Chat & session endpoints (SSE streaming)
│   ├── feedback.py   # Human-in-the-loop feedback
│   └── upload.py     # File upload handling
└── src/
    ├── agent.py      # LLM agent & MCP client setup
    └── db.py         # MongoDB utilities
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat/stream` | SSE stream — primary endpoint |
| `POST` | `/api/chat` | Non-streaming fallback |
| `GET` | `/api/sessions` | List sessions + schema |
| `GET` | `/api/sessions/{id}` | Full session with history |
| `PATCH` | `/api/sessions/{id}` | Rename session |
| `DELETE` | `/api/sessions/{id}` | Delete session |
| `POST` | `/api/feedback` | Submit feedback |
| `POST` | `/api/upload` | Upload data files |

## Docker

```bash
docker build -t comat-backend .
docker run -p 3003:3003 --env-file .env comat-backend
```

Or use `docker compose up api` from the project root.
