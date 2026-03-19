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
                              SYSTEM ARCHITECTURE
================================================================================

You can paste this in place of the diagram and keep the rest unchanged.

⸻

SYSTEM ARCHITECTURE (TEXT DESCRIPTION)

The system consists of five main layers:
	1.	Frontend (Next.js UI)
	2.	Backend API (FastAPI)
	3.	LLM Engine Layer
	4.	Data / Knowledge Layer
	5.	Human-in-the-loop feedback

The system is designed so that the LLM produces structured instructions, not UI, and never accesses the database without validation.

⸻

Frontend Layer

Technology:
	•	Next.js
	•	React
	•	TypeScript
	•	Tailwind CSS

The frontend renders the chat UI and visualizations.

It contains a component adapter layer that maps structured JSON responses to UI components.

Supported UI components:
	•	Chart widget
	•	Table widget
	•	Cards widget
	•	Custom panels

The frontend receives responses from the backend in structured JSON format and renders them.

The frontend never executes database queries.

Communication with backend happens via the API.

⸻

Backend Layer

Technology:
	•	Python
	•	FastAPI
	•	Uvicorn

Responsibilities:
	•	API routing
	•	Session management
	•	Streaming responses (SSE)
	•	Query validation
	•	Context building
	•	LLM orchestration
	•	Output formatting

Main endpoint:

POST /api/chat/stream

This endpoint streams events in the following order:
	•	session
	•	thinking
	•	query
	•	text
	•	visualization
	•	followups
	•	done

A non-streaming fallback endpoint also exists.

⸻

LLM Engine Layer

The LLM engine converts natural language input into:
	•	validated database queries
	•	statistical analysis
	•	natural language explanations
	•	visualization instructions

Pipeline:
	1.	User input received
	2.	Context builder collects schema, vector context, history, and templates
	3.	LLM generates query and reasoning
	4.	Validation layer checks query
	5.	Query executed
	6.	Output engine creates structured JSON
	7.	Response streamed to frontend

Rules:
	•	Only SELECT queries allowed (or the equivalent in MongoDB)
	•	Query must match schema
	•	Output must be structured
	•	Visualization must be declarative

⸻

Context Builder

The context builder prepares the prompt for the LLM.

Sources:
	•	MongoDB schema
	•	Vector DB documents
	•	Session history
	•	Templates
	•	System instructions

The goal is to provide enough context for correct query generation and reasoning.

⸻

Validation Layer

The validation layer checks generated queries before execution.

Restrictions:
	•	Only SELECT allowed
	•	No INSERT / UPDATE / DELETE
	•	Only known tables
	•	Only known columns

If validation fails, the LLM must regenerate the query.

⸻

Output Engine

The output engine converts LLM results into structured JSON.

Example response:

{
text: string,
visualization: {
type: chart | table | cards | none,
data: object
},
followups: string[],
query_used: string,
thinking: string[]
}

The frontend uses this structure to render UI.

⸻

Data / Knowledge Layer

Two data sources are used.

MongoDB:
	•	stores schema
	•	stores sessions
	•	stores templates
	•	stores feedback

Vector DB:
	•	stores domain knowledge
	•	stores documentation
	•	stores standards
	•	stores previous analyses

Vector DB is used for context retrieval.

MongoDB schema is used for query generation.

⸻

Human in the Loop

Feedback can be sent via API.

Used for:
	•	validation
	•	corrections
	•	evaluation
	•	manual overrides
	•	improving prompts

This allows continuous improvement of the assistant.

Design Principles
	•	LLM produces instructions, not UI
	•	Queries must be validated
	•	Schema must be known
	•	Context must be explicit
	•	Output must be structured
	•	UI must be JSON-driven
	•	Domain knowledge comes from vector DB
	•	Engineers must be able to trust results
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