# CoMat — Frontend

Chat UI and visualization layer built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4.

Renders structured JSON responses from the backend as interactive charts (Recharts), tables, cards, and dashboards.

## Setup

```bash
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Key Structure

```
src/
├── app/              # Next.js app router (pages, layouts)
└── components/       # React components
    ├── chat-container/   # Main chat interface
    ├── dashboard-panel/  # Widget dashboard
    ├── session-sidebar/  # Session management
    └── ...
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:8000` | Backend API URL |

## Docker

```bash
docker build -t comat-frontend .
docker run -p 3000:3000 -e BACKEND_URL=http://api:3003 comat-frontend
```

Or use `docker compose up frontend` from the project root.
