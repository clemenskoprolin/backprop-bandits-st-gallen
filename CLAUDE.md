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

SYSTEM ARCHITECTURE

The system consists of five main layers:
	1.	Frontend (Next.js UI)
	2.	Backend API (FastAPI)
	3.	LLM Engine Layer
	4.	Data / Knowledge Layer
	5.	Human-in-the-loop feedback

The system is designed so that the LLM produces structured instructions, not UI, and never accesses the database without validation.

For development, the MongoDB is not docker, but on  202.61.251.60 with port 27017.

You can access it with `mongosh --host 202.61.251.60 --port 27017` for testing. DO NOT CHANGE DATA THERE ON YOUR OWN.

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

# Dample questions:
## Typical questions raised by our users

> Difficulty scale: **easy → hard → extreme** (user expectation / focus of the hack)


### • Data selection & queries *(easy)*

- Show me the compression test results we performed on 4th of May for Empire Industries for their Stardust material.
- Summarize all available material properties for Fancyplast 42.
- Show me all tests we have done for customer Megaplant.
- List all charpy impact tests performed by tester MasterOfDesaster.


### • Data comparison *(easy)*

- Compare material FancyPlast 42 and UltraPlast 99 regarding property tensile strength — are the differences statistically significant?
- Do my Z05 and Z20 machines produce significantly different results?
- Do my Ulm and Kennesaw sites deliver comparable quality?

### • Data analytics *(hard)*

- Is there a degradation in the tensile strength of the material Hostacomp G2?
- Is there a trend that tensile strength is decreasing over the last 6 months in my local Plant?
- Is there an indication that boundary 10 MPa tensile modulus of material FancyPlast 42 will be violated in the future?

### • Plausibility & Interpretation *(Bonus / extreme)*

- Is the measured value plausible and as expected to industry standard ISO 1234?
- Is the measured tensile strength of Fancyplast 42 within the range of my internal guidelines and limits?

### • Complex hypotheses *(Bonus / extreme)*

- If I change parameter A, how does that influence property B?

---

example data in MongoDB:
For the Value Collection, where Measurements are Results are stored, the structure looks like this:
{
  "_id": {
    "$oid": "69b04a53df0316ab9612e11a"
  },
  "fileId": "69a18e51467aa52ae03afe9d",
  "filename": "%7B80A0F677-89BE-46e2-9F16-59409E96D8B6%7D-2.1772195394.0-%7B778AB883-C25D-448b-B1A2-3808046340ED%7D-Zwick.Unittable.ForcePerTiter.%7B778AB883-C25D-448b-B1A2-3808046340ED%7D-Zwick.Unittable.ForcePerTiter_Value",
  "uploadDate": {
    "$date": "2026-02-27T12:30:09.627Z"
  },
  "bufferLength": 8,
  "values": [
    196970697911.446
  ],
  "valuesCount": 1,
  "metadata": {
    "refId": "{80A0F677-89BE-46e2-9F16-59409E96D8B6}",
    "rootVersion": "2.1772195394.0",
    "childId": "{778AB883-C25D-448b-B1A2-3808046340ED}-Zwick.Unittable.ForcePerTiter.{778AB883-C25D-448b-B1A2-3808046340ED}-Zwick.Unittable.ForcePerTiter_Value"
  }
}

{
  "_id": "{D1CB87C7-D89F-4583-9DA8-5372DC59F25A}",
  "clientAppType": "testXpert III",
  "state": "finishedOK",
  "tags": [
    "{B9D90822-09A8-4eab-871B-70FD0C1B4CD3}"
  ],
  "version": "2.1772195387.0",
  "valueColumns": [
    {
      "unitTableId": "Zwick.Unittable.Displacement",
      "valueTableId": "{E4C21909-B178-4fdc-8662-A13B4C7FF756}-Zwick.Unittable.Displacement",
      "_id": "{E4C21909-B178-4fdc-8662-A13B4C7FF756}-Zwick.Unittable.Displacement_Key",
      "name": "Strain / Deformation",
    },
   ...
  ],
  "hasMachineConfigurationInfo": false,
  "testProgramId": "TestProgram_2",
  "testProgramVersion": "2.1772195387.0",
  "name": "01",
  "modifiedOn": {},
  "TestParametersFlat": { [see nextmsg]
  }
}
 contd.
  "TestParametersFlat": {  "TYPE_OF_TESTING_STR": "tensile",
    "MACHINE_TYPE_STR": "Static",
    "STANDARD": "DIN EN ",
    "TESTER": "Tester_1",
    "NOTES": "Auswertung E-Modul nach ClipOn Punkten",
    "Wall thickness": 0.002,
    "SPECIMEN_THICKNESS": 0.001925,
    "SPECIMEN_WIDTH": 0.015075,
    "Diameter": 0.00011,
    "Outer diameter": 0.1,
    "Inner diameter": 0.008,
    "Fineness": 0.00001,
    "Density of the specimen material": 1000,
    "Weight of the specimen": 0.001,
    "Total length of the specimen": 0.1,
    "Cross-section input": 0.000001,
    "Parallel specimen length": 0.1,
    "Marked initial gage length": 0.08,
    "TEST_SPEED": 0.0000333333333333,
    "Date": "26.11.2021",
    "Upper force limit": 3000,
    "Maximum extension": 0.005,
    "Cross-section correction factor": 1,
    "Negative cross-section correction value": 0,
    "Grip to grip separation at the start position": 0.1227327709145275,
    "Type of Young's modulus determination": 1,
    "Begin of Young's modulus determination": 0.0005,
    "End of Young's modulus determination": 0.0025,
    "Force shutdown threshold": 20,
    "Gage length, fine strain": 0.02,
    "Speed, Young's modulus": 0.0000166666666667,
    "Speed, point of load removal": 0.0008333333333333,
    "Speed, yield point": 0.0000166666666667,
    "Max. permissible force at end of test": 250,
    "Tube definition": 2,
    "Travel preset x1%": 0.01,
    "Travel preset x2%": 0.02,
    "Young's modulus preset": 210000000000,
    "JOB_NO": "11918",
    "CUSTOMER": "Company_1",
    "SPECIMEN_TYPE": "IPS",
    "Headline for the report": "Prüfprotokoll",
    "Clock time": "09:42:38",
    "Gage length after break": 0.12,
    "Diameter 1 after break": 0.002,
    "Diameter 2 after break": 0.009,
    "Specimen thickness after break": 0.002,
    "Specimen width after break": 0.005,
    "Cross-section after break": 0
}