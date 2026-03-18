"""
Templates router — saved / reusable query prompts.

Routes:
  GET    /api/templates
  POST   /api/templates
  DELETE /api/templates/{template_id}
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models import CreateTemplateRequest, Template

router = APIRouter(prefix="/api", tags=["templates"])

# In-memory store (replace with DB later)
_templates: dict[str, Template] = {}


@router.get("/templates", response_model=list[Template])
async def list_templates() -> list[Template]:
    """Return all saved query templates."""
    return list(_templates.values())


@router.post("/templates", response_model=Template, status_code=201)
async def create_template(req: CreateTemplateRequest) -> Template:
    """Save a prompt as a reusable template."""
    template = Template(name=req.name, prompt=req.prompt)
    _templates[template.template_id] = template
    return template


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    if template_id not in _templates:
        raise HTTPException(status_code=404, detail="Template not found")
    del _templates[template_id]
    return {"status": "deleted", "template_id": template_id}
