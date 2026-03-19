"""
Upload router — accepts PDF files and ingests them into the RAG vector store.

Routes:
  POST /api/upload  — multipart upload: saves file, calls RAG /ingest
"""

import os
import tempfile
import requests

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/api", tags=["upload"])

RAG_URL = os.getenv("RAG_URL", "http://localhost:8000")


@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: str = Form(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    contents = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
        print("Saved temporary:", tmp.name, tmp_path)


    try:
        response = requests.post(
            f"{RAG_URL}/ingest",
            json={"file_paths": [tmp_path], "session_id": session_id},
            timeout=60,
        )
        if not response.ok:
            raise HTTPException(status_code=502, detail=f"RAG ingest failed: {response.text}")
        return {"success": True, "filename": file.filename}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Could not reach RAG service: {e}")
    finally:
        os.unlink(tmp_path)
