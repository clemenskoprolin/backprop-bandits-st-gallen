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
        self.db = Chroma(
            persist_directory=CHROMA_PATH,
            embedding_function=self.embedding_func
        )

    def retrieve_context(self, query, k=NUM_CONTEXT_CHUNKS) -> str:
        results = self.db.similarity_search_with_score(query, k=k)
        docs = []
        seen_content = set()

        for doc, score in results:
            similarity = max(0, 1 - score)

            clean_content = doc.page_content.strip()
            if clean_content in seen_content:
                continue
            seen_content.add(clean_content)

            if similarity > SIMILARITY_THRESHOLD:
                docs.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "score": similarity
                })

        return "\n\n".join(d["content"] for d in docs) if docs else "No relevant context found."
