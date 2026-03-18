import sys
from pathlib import Path

# Ensure `backend/` is on sys.path so `routers.*` imports work when uvicorn
# is invoked as `uvicorn backend.main:app` from the project root.
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import chat, feedback, templates

app = FastAPI(title="Backprop Bandits — Material Testing AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(feedback.router)
app.include_router(templates.router)


@app.get("/")
def read_root():
    return {"status": "ok"}
