FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy source code
COPY . .

EXPOSE 3002

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3002"]
