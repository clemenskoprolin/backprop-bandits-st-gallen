from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Union
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Visualization
# ---------------------------------------------------------------------------


class VisualizationBlock(BaseModel):
    chart_type: str = "bar"
    title: str = ""
    x_label: str = ""
    y_label: str = ""
    series: list[Any] = []



# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None  # omit to start a new session


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    text: Union[str,list]
    visualization: VisualizationBlock | None = None
    followups: list[str] = Field(default_factory=list)
    query_used: str | None = None
    thinking: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sessions / history
# ---------------------------------------------------------------------------


class Message(BaseModel):
    message_id: str = Field(default_factory=lambda: str(uuid4()))
    role: Literal["user", "assistant"]
    content: Union[str,list]
    visualization: VisualizationBlock | None = None
    query_used: str | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class WidgetLayout(BaseModel):
    """Persisted layout for a dashboard widget."""
    id: str
    message_id: str
    x: int = 0
    y: int = 0
    w: int = 1


class Session(BaseModel):
    session_id: str
    title: str | None = None  # derived from first user message
    messages: list[Message] = Field(default_factory=list)
    widget_layouts: list[WidgetLayout] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SessionSummary(BaseModel):
    """Lightweight session entry for the session list."""

    session_id: str
    title: str | None
    updated_at: datetime
    message_count: int


class SchemaField(BaseModel):
    name: str
    type: str
    description: str | None = None


class DatasetSchema(BaseModel):
    """Available data schema — helps users and LLM know what can be queried."""

    tables: dict[str, list[SchemaField]] = Field(default_factory=dict)


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
    schema_: DatasetSchema = Field(alias="schema", default_factory=DatasetSchema)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Feedback (human-in-the-loop)
# ---------------------------------------------------------------------------


class FeedbackRequest(BaseModel):
    message_id: str
    session_id: str
    rating: Literal["thumbs_up", "thumbs_down"]
    comment: str | None = None


class FeedbackResponse(BaseModel):
    feedback_id: str
    status: str = "received"


# ---------------------------------------------------------------------------
# Templates (saved / reusable queries)
# ---------------------------------------------------------------------------


class Template(BaseModel):
    template_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    prompt: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CreateTemplateRequest(BaseModel):
    name: str
    prompt: str
