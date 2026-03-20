# CoMat — RAG Service

Document ingestion and contextual retrieval service. Ingests PDFs and domain documents into a ChromaDB vector store, then provides relevant context to the backend for grounding LLM responses.

Built with Python 3.13, FastAPI, ChromaDB, and Sentence Transformers.

## Setup

```bash
uv sync
uv run uvicorn main:app --reload --port 3002
```

Runs at [http://localhost:3002](http://localhost:3002).

## Key Structure

```
rag/
├── main.py          # FastAPI endpoints
├── retriever.py     # Vector DB context retrieval
├── ingestor.py      # PDF/document ingestion pipeline
└── vector_store/    # ChromaDB persistent storage
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/ingest` | Ingest files into the vector store |
| `POST` | `/generate_context` | Retrieve relevant context for a query |
| `POST` | `/clear_database` | Clear the vector store |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROMA_PATH` | `./vector_store` | ChromaDB storage path |

## Docker

```bash
docker build -t comat-rag .
docker run -p 3002:3002 comat-rag
```

Or use `docker compose up rag` from the project root.
