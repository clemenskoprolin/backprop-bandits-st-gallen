from ingestor import ingest_files, clear_database
from retriever import RAGRetriever

path = "/home/paulkling/Coding/backprop-bandits-st-gallen/backend/data/test_pdfs/92_Maler_-_Pruefmethoden_-_2415.pdf"

print(ingest_files([path]))

retriever = RAGRetriever()
print(retriever.retrieve_context("Was ist die maximale Kraft, die auf das Material ausgeübt werden darf?"))