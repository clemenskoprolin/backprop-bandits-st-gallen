# Agent Workflow — Backprop Bandits

```mermaid
flowchart TD
    %% ── Styling ──────────────────────────────────────────────────────────────
    classDef user       fill:#4f46e5,color:#fff,stroke:none,rx:8
    classDef context    fill:#0891b2,color:#fff,stroke:none,rx:8
    classDef agent      fill:#7c3aed,color:#fff,stroke:none,rx:8
    classDef tools      fill:#b45309,color:#fff,stroke:none,rx:8
    classDef visual     fill:#059669,color:#fff,stroke:none,rx:8
    classDef output     fill:#dc2626,color:#fff,stroke:none,rx:8
    classDef frontend   fill:#0f766e,color:#fff,stroke:none,rx:8
    classDef memory     fill:#9333ea,color:#fff,stroke:none,rx:8
    classDef rag        fill:#0369a1,color:#fff,stroke:none,rx:8
    classDef muted      fill:#374151,color:#fff,stroke:none,rx:8

    %% ── PDF Upload Flow (top-left) ───────────────────────────────────────────
    subgraph PDF_FLOW["📎 PDF Knowledge Ingestion"]
        direction TB
        PDF["User drops PDF"]:::user
        UPLOAD["POST /api/upload\nBackend saves temp file"]:::muted
        RAG_INGEST["POST /ingest\nRAG Microservice\nPyPDFLoader → chunk → embed"]:::rag
        CHROMA_RAG["Chroma Vector Store\nper-session collection\n(all-MiniLM-L6-v2)"]:::rag
        PDF --> UPLOAD --> RAG_INGEST --> CHROMA_RAG
    end

    %% ── User Query ───────────────────────────────────────────────────────────
    USER["👤 User sends message\n(natural language query)"]:::user

    %% ── Context Building ─────────────────────────────────────────────────────
    subgraph CONTEXT["🔍 Context Building  (Agent.__init__)"]
        direction TB
        CTX1["RAG: embed query →\nsimilarity search PDFs\nPOST /generate_context"]:::rag
        CTX2["Long-term Memory:\nembed query →\ncosine search Chroma\n(memory_store)"]:::memory
        CTX3["Dashboard Widget State\n(selected widgets,\ndata point selections)"]:::muted
    end

    %% ── LangGraph Agent ──────────────────────────────────────────────────────
    subgraph GRAPH["🤖 LangGraph Agent Graph  (claude-sonnet-4-6)"]
        direction TB

        AGENT_NODE["agent\ncall_model\nClaude claude-sonnet-4-6 + all tools bound"]:::agent

        subgraph TOOL_NODE["tools  ToolNode"]
            direction LR
            T1["find / aggregate\ncount / collection-schema\n(MongoDB MCP)"]:::tools
            T2["run_python_analysis\nnumpy / pandas / scipy\n(stats, regression, t-test)"]:::tools
            T3["save_memory\nembed insight →\nChroma memory_store"]:::memory
            T4["get_sample_documents\nget_aggregated_data_for_chart"]:::tools
        end

        SHOULD_CONT{"should_continue\ntool_calls present?"}:::muted

        VISUALIZER["visualizer\nClaude decides\nwhat to render"]:::visual

        subgraph VISUAL_TOOLS["visual_tool  ToolNode"]
            direction LR
            V1["render_visualization\nbar/line/area/pie/\nradar/boxplot/\n+ referenceLine forecast"]:::visual
            V2["render_text_block\nMarkdown summary\non dashboard"]:::visual
            V3["remove_widget\nreorder_dashboard"]:::visual
        end

        HAS_VIS{"has_visual\nvisualization\ncalled?"}:::muted

        OUTPUT_NODE["output\nClaude composes\nfinal answer"]:::agent

        SUBMIT["submit_tool\nsubmit_answer\n(answer + hypotheses)"]:::output
    end

    %% ── SSE Stream ───────────────────────────────────────────────────────────
    subgraph SSE["📡 SSE Stream  POST /api/chat/stream"]
        direction LR
        E1["session"]:::muted
        E2["thinking"]:::muted
        E3["query"]:::muted
        E4["text"]:::muted
        E5["visualization"]:::muted
        E6["followups"]:::muted
        E7["done"]:::muted
    end

    %% ── Frontend ─────────────────────────────────────────────────────────────
    subgraph FRONTEND["💻 Next.js Frontend"]
        direction TB
        CHAT_MSG["Chat Message\n(markdown, thinking steps,\nquery viewer, feedback)"]:::frontend
        DASHBOARD["Dashboard Panel\n(drag/drop widgets:\ncharts, tables, cards,\ntext blocks)"]:::frontend
        FOLLOWUPS["Follow-up suggestions\n(clickable hypotheses)"]:::frontend
    end

    %% ── Feedback Loop ────────────────────────────────────────────────────────
    FEEDBACK["👍 / 👎 User Feedback\nPOST /api/feedback"]:::user
    MEM_STORE["Chroma\nmemory_store\n(persistent findings,\nbaselines, corrections)"]:::memory

    %% ── Connections ──────────────────────────────────────────────────────────
    USER --> CONTEXT
    CONTEXT --> GRAPH

    AGENT_NODE --> SHOULD_CONT
    SHOULD_CONT -->|"has tool calls"| TOOL_NODE
    TOOL_NODE -->|"loop"| AGENT_NODE
    SHOULD_CONT -->|"no tool calls"| VISUALIZER
    VISUALIZER --> HAS_VIS
    HAS_VIS -->|"yes"| VISUAL_TOOLS
    HAS_VIS -->|"no"| OUTPUT_NODE
    VISUAL_TOOLS --> OUTPUT_NODE
    OUTPUT_NODE --> SUBMIT

    SUBMIT --> SSE
    SSE --> FRONTEND

    FRONTEND --> FEEDBACK
    FEEDBACK -->|"thumbs down\n+ comment"| MEM_STORE

    T3 --> MEM_STORE
    MEM_STORE -->|"retrieved at\ncontext build"| CTX2

    CHROMA_RAG -->|"retrieved at\ncontext build"| CTX1

    %% ── Predictive Chart Annotation ──────────────────────────────────────────
    V1 -. "forecast_ series\n+ referenceLine\n→ boundary violation\nforecast chart" .-> DASHBOARD
```

---

## Legend

| Colour | Component |
|---|---|
| 🟣 Indigo | User interactions |
| 🔵 Cyan | RAG / vector retrieval |
| 🟣 Purple | LLM agent nodes (Claude) |
| 🟠 Amber | Analysis & data tools |
| 🟢 Green | Visualisation layer |
| 🔴 Red | Output / answer submission |
| 🟦 Teal | Next.js frontend |
| 🟣 Violet | Long-term memory (Chroma) |

## Key flows

1. **Normal query** → Context build → Agent loop (MongoDB + Python analysis) → Visualizer → Dashboard widgets + chat answer
2. **PDF upload** → RAG microservice → session-scoped Chroma → injected as context on next query
3. **Memory write** → Agent calls `save_memory` when finding something significant → embedded → stored in `memory_store`
4. **Memory read** → Every new query embeds the user message → cosine similarity search → top matches injected into system prompt
5. **Feedback loop** → Thumbs down + comment → `save_correction()` → stored as `correction` memory → surfaces in future similar queries
6. **Predictive chart** → Agent runs linear regression → builds historical + `forecast_*` series with null gaps → `referenceLine` for spec limit → dashed forecast line rendered in frontend
