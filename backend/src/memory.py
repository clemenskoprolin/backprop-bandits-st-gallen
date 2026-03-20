"""
Long-term agent memory using sentence embeddings + ChromaDB.

Memories are embedded with all-MiniLM-L6-v2 and stored in a persistent
Chroma collection. Retrieval is cosine-similarity search so contextually
related findings surface even without exact keyword matches.

Usage:
    from src.memory import save_memory, get_relevant_memories, save_correction
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
MEMORY_STORE_PATH = os.getenv(
    "MEMORY_STORE_PATH",
    os.path.join(os.path.dirname(__file__), "..", "memory_store"),
)
SIMILARITY_THRESHOLD = float(os.getenv("MEMORY_SIMILARITY_THRESHOLD", "0.25"))
MAX_MEMORIES = int(os.getenv("MEMORY_MAX_RESULTS", "6"))

# Lazy singletons – initialised on first use so startup stays fast
_embeddings: HuggingFaceEmbeddings | None = None
_store: Chroma | None = None


def _get_store() -> Chroma:
    global _embeddings, _store
    if _store is None:
        logger.info("[memory] initialising embedding model: %s", EMBEDDING_MODEL)
        _embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
        _store = Chroma(
            collection_name="agent_memory",
            embedding_function=_embeddings,
            persist_directory=MEMORY_STORE_PATH,
            collection_metadata={"hnsw:space": "cosine"},
        )
        logger.info("[memory] store ready at %s (%d entries)", MEMORY_STORE_PATH, _count())
    return _store


def _count() -> int:
    try:
        return _store._collection.count()  # type: ignore[union-attr]
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def save_memory(summary: str, detail: str, memory_type: str) -> str:
    """
    Embed and persist a finding to long-term memory.

    Args:
        summary:     One-sentence headline (used in context injection).
        detail:      Full explanation including numbers, dates, and context.
        memory_type: 'finding' | 'pattern' | 'baseline' | 'correction' | 'preference'
    """
    store = _get_store()
    text = f"{summary}\n\n{detail}"
    metadata = {
        "summary": summary,
        "type": memory_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    store.add_texts([text], metadatas=[metadata])
    logger.info("[memory] saved %s: %s", memory_type, summary[:80])
    return f"Memory saved ({memory_type}): {summary[:80]}"


def get_relevant_memories(query: str, n_results: int = MAX_MEMORIES) -> list[dict]:
    """
    Return the most semantically similar memories for a given query string.
    Filters out results below SIMILARITY_THRESHOLD.
    """
    store = _get_store()
    try:
        total = _count()
        if total == 0:
            return []
        k = min(n_results, total)
        results = store.similarity_search_with_score(query, k=k)
        memories = []
        for doc, score in results:
            # Chroma cosine distance: 0 = identical, 2 = opposite
            similarity = max(0.0, 1.0 - score)
            if similarity >= SIMILARITY_THRESHOLD:
                memories.append(
                    {
                        "summary": doc.metadata.get("summary", doc.page_content[:120]),
                        "type": doc.metadata.get("type", "finding"),
                        "created_at": doc.metadata.get("created_at", ""),
                        "similarity": round(similarity, 3),
                    }
                )
        logger.info("[memory] query returned %d relevant memories (k=%d)", len(memories), k)
        return memories
    except Exception as e:
        logger.warning("[memory] retrieval failed: %s", e)
        return []


def save_correction(context: str, user_comment: str) -> str:
    """Persist a user thumbs-down correction as a 'correction' memory."""
    return save_memory(
        summary=f"User correction: {user_comment[:120]}",
        detail=f"Context/topic: {context}\nUser said: {user_comment}",
        memory_type="correction",
    )
