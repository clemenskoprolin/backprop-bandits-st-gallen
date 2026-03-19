import httpx

stream = False
if (stream):
    with httpx.Client() as client:
        with client.stream(
            "POST",
            "http://localhost:8000/api/chat/stream",
            json={"message": "List all tests", "session_id": None},
            timeout=60.0
        ) as response:
            for line in response.iter_lines():
                if line:
                    print(line)

else:
    response = httpx.post(
        "http://localhost:8000/api/chat",
        json={"message": "Generate a bar chart with data x=[1,2,3,4] y=[5,6,7,8]", "session_id": None},
        timeout=60.0  # ← outside json, as httpx parameter
    )
    print(response.json())