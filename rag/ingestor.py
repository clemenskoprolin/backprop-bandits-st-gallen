import os
import shutil
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv

load_dotenv()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL")
CHROMA_PATH = os.getenv("CHROMA_PATH")


def ingest_files(file_paths, session_id):
    """
    Accepts a list of file paths (temp files from Streamlit),
    processes them, and updates the Vector DB.
    """
    
    # Load PDFs
    docs = []
    for path in file_paths:
        print(f"Processing: {path}")
        try:
            loader = PyPDFLoader(path)
            docs.extend(loader.load())
        except Exception as e:
            print(f"Error loading {path}: {e}")
            return False

    if not docs:
        return False

    #Chunking
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=100,
        length_function=len,
        add_start_index=True,
    )
    chunks = text_splitter.split_documents(docs)
    print(f"Split into {len(chunks)} chunks.")

    # Embed & Store (Incremental Update)
    embedding_func = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    
    session_db_path = os.path.join(CHROMA_PATH, session_id)
    Chroma.from_documents(
        documents=chunks,
        embedding=embedding_func,
        persist_directory=session_db_path,
        collection_metadata={"hnsw:space": "cosine"}
    )
    
    print(f"Ingestion Complete. Added to {session_db_path}")
    return True

def clear_database():
    """Wipes the vector store to start fresh."""
    if os.path.exists(CHROMA_PATH):
        shutil.rmtree(CHROMA_PATH)
    print("Database cleared.")