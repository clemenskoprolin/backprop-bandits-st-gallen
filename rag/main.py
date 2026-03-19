from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from retriever import RAGRetriever
from ingestor import ingest_files, clear_database


app = FastAPI(title="RAG Microservice")

class IngestRequest(BaseModel):
    file_paths: list[str]
    session_id: str

class ContextRequest(BaseModel):
    query: str
    session_id: str

retriever = RAGRetriever()

@app.post("/ingest")
def ingest(request: IngestRequest):
    try:
        success = ingest_files(request.file_paths, request.session_id)
    except Exception as e:
        success = False
        print("ingest failed:", e)
    print(success)
    return {"success": success}

@app.post("/generate_context")
def generate_context(request: ContextRequest):
    try:
        context = retriever.retrieve_context(request.query, request.session_id)
        return {"context": context}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/clear_database")
def clear_db():
    clear_database()
    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
