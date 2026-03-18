================================================================================
                              SYSTEM ARCHITECTURE
================================================================================


┌─────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND                                  │
│                                 Next.js UI                                  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Component Adapter Layer                       │  │
│  │                     (templates / widgets / panels)                    │  │
│  │                                                                       │  │
│  │   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐           │  │
│  │   │ Chart    │   │ Table    │   │ Cards    │   │ Custom   │           │  │
│  │   │ Widget   │   │ Widget   │   │ Widget   │   │ Panels   │           │  │
│  │   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘           │  │
│  │        │              │              │              │                 │  │
│  │        └──────────────┴──────┬───────┴──────────────┘                 │  │
│  │                               │                                       │  │
│  │                        Structured JSON                                │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   │ API (FastAPI / MCP)
                                   ▼


┌─────────────────────────────────────────────────────────────────────────────┐
│                                  BACKEND                                    │
│                               Python / FastAPI                              │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                               LLM ENGINE LAYER                              │
│                                                                             │
│  User Input                                                                 │
│     │                                                                       │
│     ▼                                                                       │
│  ┌───────────────┐                                                          │
│  │ Ask anything  │                                                          │
│  └──────┬────────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────┐                                                   │
│  │   Context Builder    │◄───────────────┐                                  │
│  └─────────┬────────────┘                │                                  │
│            │                             │                                  │
│            ▼                             │                                  │
│      ┌────────────┐                      │                                  │
│      │   LLM      │                      │                                  │
│      │  Engine    │                      │                                  │
│      └────┬───────┘                      │                                  │
│           │                              │                                  │
│     ┌─────┴─────┐                        │                                  │
│     │           │                        │                                  │
│     ▼           ▼                        │                                  │
│  Query        Text                       │                                  │
│     │           │                        │                                  │
│     ▼           │                        │                                  │
│  ┌──────────────────────────────┐        │                                  │
│  │ Validation Layer              │        │                                  │
│  │ (SQL only SELECT allowed)     │        │                                  │
│  └──────────────┬───────────────┘        │                                  │
│                 │                        │                                  │
│                 ▼                        │                                  │
│            ┌──────────┐                  │                                  │
│            │ Thinking │                  │                                  │
│            └────┬─────┘                  │                                  │
│                 ▼                        │                                  │
│          ┌──────────────┐                │                                  │
│          │ Output Engine │───────────────┼───────────────► Structured JSON   │
│          └──────┬────────┘                │                                  │
│                 │                         │                                  │
│             Followups                     │                                  │
│                                           │                                  │
└───────────────────────────────────────────┼──────────────────────────────────┘
                                            │
                                            │ Context / Augmentation
                                            ▼


┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA / KNOWLEDGE                               │
│                                                                             │
│  ┌──────────────────────────┐        ┌──────────────────────────┐           │
│  │      Vector DB           │        │        MongoDB           │           │
│  │   (Free-text / emb.)     │        │        Schema            │           │
│  └──────────┬───────────────┘        └──────────┬───────────────┘           │
│             │                                   │                           │
│             └───────────────┬───────────────────┘                           │
│                             ▼                                               │
│                      Context Augmentation                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                              HUMAN IN THE LOOP                              │
│                                                                             │
│     hm        hm        manual override / validation / feedback              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘



================================================================================
Notes
--------------------------------------------------------------------------------
- Templates populated from structured JSON
- LLM produces UI instructions, not UI directly
- Query validation required before DB access
- Vector DB used for context retrieval
- Mongo schema used for query generation
- MCP / API connects UI <-> LLM <-> Data
================================================================================


================================================================================
                               PROJECT CONTEXT
================================================================================

Problem: Material testing engineers and R&D developers struggle to efficiently
analyse large, inhomogeneous cohorts of test data. Traditional data scientists
lack domain expertise; engineers lack statistical / data skills. Test data is
underutilised for business decisions.

Solution: AI assistant that understands natural language questions from material
testing engineers, selects and queries relevant data, applies appropriate
statistical methods, and returns answers in natural language with charts/tables.

Users: Material testing engineers, R&D developers

Typical queries:
  - "List all data points with tensile strength > 400 MPa"
  - "Compare material A vs B — statistically significant difference?"
  - "Is there a trend suggesting boundary XYZ will be violated?"
  - "If I change parameter A, does that influence property B?"

Tech stack:
  - Backend:  Python 3.13 · FastAPI · uv
  - Frontend: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
  - Data:     MongoDB (schema/query gen) · Vector DB (context retrieval)
  - AI:       Claude API (LLM engine)

Run backend:  uvicorn backend.main:app --reload   (from project root)
Run frontend: cd frontend && npm run dev


================================================================================
                                 API ROUTES
================================================================================

All routes are prefixed /api.

┌──────────────────────────────┬────────────────────────────────────────────────┐
│ Route                        │ Purpose                                        │
├──────────────────────────────┼────────────────────────────────────────────────┤
│ POST /api/chat/stream        │ PRIMARY — SSE stream, NL query → live events   │
│ POST /api/chat               │ Non-streaming fallback (same response shape)   │
│ GET  /api/sessions           │ List sessions + data schema                    │
│ GET  /api/sessions/{id}      │ Full session with message history + charts     │
│ DELETE /api/sessions/{id}    │ Remove session                                 │
│ POST /api/feedback           │ Thumbs up/down + comment (human-in-the-loop)  │
│ GET  /api/templates          │ List saved query templates                     │
│ POST /api/templates          │ Save a prompt as reusable template             │
│ DELETE /api/templates/{id}   │ Remove template                                │
└──────────────────────────────┴────────────────────────────────────────────────┘

--------------------------------------------------------------------------------
SSE stream event sequence  (POST /api/chat/stream)
--------------------------------------------------------------------------------

  event: session        { session_id, message_id }
  event: thinking       { step: str }               ← one or more
  event: query          { query_used: str }
  event: text           { chunk: str }               ← one or more
  event: visualization  { type, data }
  event: followups      { suggestions: [str] }
  event: done           {}

--------------------------------------------------------------------------------
ChatResponse shape  (POST /api/chat — non-streaming)
--------------------------------------------------------------------------------

  {
    "session_id":    "uuid",
    "message_id":    "uuid",
    "text":          "LLM narrative answer",
    "visualization": { "type": "chart|table|cards|none", "data": {...} },
    "followups":     ["suggested next question", ...],
    "query_used":    "SELECT ...",
    "thinking":      ["step 1", "step 2", ...]
  }

--------------------------------------------------------------------------------
Session message shape  (stored per message, enables chart re-render in history)
--------------------------------------------------------------------------------

  {
    "message_id":    "uuid",
    "role":          "user | assistant",
    "content":       "text",
    "visualization": { "type": "chart", "data": {...} },   ← nullable
    "query_used":    "SELECT ...",                          ← nullable
    "timestamp":     "ISO8601"
  }

--------------------------------------------------------------------------------
GET /api/sessions  also returns the data schema:
--------------------------------------------------------------------------------

  {
    "sessions": [ { session_id, title, updated_at, message_count }, ... ],
    "schema":   { "tables": { "test_results": [ { name, type, description }, ... ] } }
  }

================================================================================