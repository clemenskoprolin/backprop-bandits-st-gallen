import os
import httpx
import json
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL")
CHROMA_PATH = os.getenv("CHROMA_PATH")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", 0.8))
NUM_CONTEXT_CHUNKS = int(os.getenv("NUM_CONTEXT_CHUNKS", 5))


class RAGRetriever:
    def __init__(self):
        self.embedding_func = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    def retrieve_context(self, query, session_id, k=NUM_CONTEXT_CHUNKS) -> str:
        session_db_path = os.path.join(CHROMA_PATH, session_id)

        if not os.path.exists(session_db_path):
            raise ValueError(f"No vector store found for session '{session_id}'")

        try:
            db = Chroma(
                persist_directory=session_db_path,
                embedding_function=self.embedding_func,
                collection_metadata={"hnsw:space": "cosine"}
            )
            results = db.similarity_search_with_score(query, k=k)
        except Exception as e:
            raise ValueError(f"Chroma error for session '{session_id}': {e}")

        docs = []
        seen_pages = set()

        for doc, score in results:
            page_key = (doc.metadata.get("source"), doc.metadata.get("page"))
            if page_key in seen_pages:
                continue
            seen_pages.add(page_key)

            similarity = max(0, 1 - score)
            print(f"score={score:.4f}  similarity={similarity:.4f}  | {doc.page_content[:80]}")

            if similarity > SIMILARITY_THRESHOLD:
                docs.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "score": similarity
                })

        return "\n\n".join(d["content"] for d in docs) if docs else "No relevant context found."