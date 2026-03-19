import httpx

response = httpx.post(
    "http://localhost:8000/api/chat",
    json={"message": "List all tests", "session_id": None},
    timeout=60.0  # ← outside json, as httpx parameter
)
print(response.json())