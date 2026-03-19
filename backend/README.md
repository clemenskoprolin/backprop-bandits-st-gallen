# Backprop Bandits - Backend Setup

## Prerequisites

- Docker (for MongoDB MCP server)
- Python 3.13+
- MongoDB instance running at `mongodb://202.61.251.60:27017`

## Quick Start

### 1. Start the MongoDB MCP Server

The MCP server runs in Docker and provides MongoDB tools to the AI agent.

```bash
cd /home/funke/StartHack26/backprop-bandits-st-gallen
docker-compose -f docker-compose.mcp.yml up -d
```

Verify it's running:
```bash
docker ps | grep mongodb-mcp
```

### 2. Install Python Dependencies

```bash
cd backend
pip install -e .
# or with uv:
uv sync
```

### 3. Start the Backend

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

On startup, you should see:
```
Loaded X tools from MongoDB MCP server
  - find: Query documents in a MongoDB collection...
  - aggregate: Run an aggregation pipeline...
  ...
Agent rebuilt with MCP tools
MongoDB MCP client initialized
```

## Configuration

Environment variables can be set in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_URI` | `mongodb://202.61.251.60:27017` | MongoDB connection string |
| `DATABASE_NAME` | `testdb` | Database name |
| `COLLECTION_NAME` | `tests` | Default collection |
| `MCP_SERVER_URL` | `http://localhost:3000/mcp` | MCP server endpoint |
| `ANTHROPIC_API_KEY` | - | Required for Claude AI |

Example `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-xxx
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=testdb
MCP_SERVER_URL=http://localhost:3000/mcp
```

## Architecture

```
┌─────────────────────┐     HTTP/MCP      ┌─────────────────────┐
│   Python Backend    │ ◄───────────────► │ MongoDB MCP Server  │
│   FastAPI :8000     │    port 3000      │     (Docker)        │
└─────────────────────┘                   └─────────────────────┘
         │                                          │
         │                                          ▼
         │                                ┌─────────────────────┐
         └───────────────────────────────►│     MongoDB         │
              (direct queries)            │  202.61.251.60:27017│
                                          └─────────────────────┘
```

## Available MCP Tools

Once running, the agent has access to these MongoDB tools (auto-discovered):

| Tool | Description |
|------|-------------|
| `find` | Query documents with filters, projection, sort |
| `aggregate` | Full aggregation pipeline support |
| `count` | Count documents matching a filter |
| `collection-schema` | Infer schema from collection |
| `list-collections` | List all collections |
| `list-databases` | List all databases |
| `db-stats` | Database statistics |

Plus custom tools:
- `get_test` - Get specific test by ID
- `search_tests` - Search with basic filters
- `get_aggregated_data_for_chart` - Recharts-formatted aggregations
- `render_visualization` - Render charts on the UI

## Troubleshooting

### MCP Server not connecting

Check if Docker container is running:
```bash
docker logs mongodb-mcp-server
```

Test the MCP endpoint:
```bash
curl http://localhost:3000/mcp
```

### Backend starts without MCP tools

If you see "Failed to initialize MCP client", ensure:
1. Docker container is running
2. Port 3000 is accessible
3. `MCP_SERVER_URL` is correct

The backend will continue without MCP tools but with reduced functionality.

## Development

### Stop services

```bash
# Stop MCP server
docker-compose -f docker-compose.mcp.yml down

# Stop backend
Ctrl+C
```

### View logs

```bash
# MCP server logs
docker logs -f mongodb-mcp-server

# Backend logs appear in terminal
```
