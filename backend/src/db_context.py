"""
db_context.py

Drop-in replacement for your hardcoded DB_CONTEXT string.
Call `build_db_context()` at startup (after MCP init) and use the
returned string in place of the old DB_CONTEXT constant.

Also exports:
  - resolve_childId   LangChain @tool for the agent
  - CHANNEL_MAP       dict loaded from channelParameterMap file
  - RESULT_TYPE_MAP   dict loaded from TestResultTypes file
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from langchain_core.tools import tool

# ---------------------------------------------------------------------------
# 1.  UUID map loader
# ---------------------------------------------------------------------------

def _load_json_map(path: str | Path) -> dict:
    """Load a JSON file, return {} on any failure."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_channel_map(path: str | Path) -> dict[str, str]:
    """
    Normalise channelParameterMap to {uuid_upper: human_name}.

    Actual file shape:
      [{"uuid": "6302239B-...", "name": "Gage length, fine strain", ...}, ...]
    """
    raw = _load_json_map(path)
    out: dict[str, str] = {}
    if not isinstance(raw, list):
        return out
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        uuid = entry.get("uuid") or entry.get("_id") or ""
        uuid = uuid.strip("{}").upper()
        if not uuid:
            continue
        name = entry.get("name") or entry.get("en") or entry.get("label") or uuid
        out[uuid] = name
    return out


def _load_result_type_map(path: str | Path) -> dict[str, str]:
    """
    Normalise TestResultTypes to {uuid_upper: human_name}.

    Actual file shape:
      [{"_id": "{04A31CB5-...}", "en": "System time sensor"}, ...]
    """
    raw = _load_json_map(path)
    out: dict[str, str] = {}
    if not isinstance(raw, list):
        return out
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        uuid = entry.get("_id") or entry.get("uuid") or ""
        uuid = uuid.strip("{}").upper()
        if not uuid:
            continue
        name = entry.get("en") or entry.get("name") or entry.get("label") or uuid
        out[uuid] = name
    return out


def _build_uuid_table(mapping: dict[str, str], max_rows: int = 40) -> str:
    """Return a compact two-column text table (UUID → label)."""
    rows = list(mapping.items())[:max_rows]
    lines = [f"  {{{uuid}}}  →  {label}" for uuid, label in rows]
    if len(mapping) > max_rows:
        lines.append(f"  … ({len(mapping) - max_rows} more entries not shown)")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 2.  Schema extraction — keys only, no values, no large arrays
# ---------------------------------------------------------------------------

# Top-level fields in _tests whose values are large arrays we never want
# to include in context. valueColumns alone can be 574 entries × N fields.
_SKIP_KEYS = {"valueColumns", "valuecolumns", "values"}


def _extract_keys(obj: object, path: str = "", depth: int = 0, max_depth: int = 3) -> list[str]:
    """
    Recursively walk a decoded JSON object and return a sorted list of
    dot-notation paths (no values). Skips keys in _SKIP_KEYS at any depth.

    Example output:
      _id
      state
      TestParametersFlat.CUSTOMER
      TestParametersFlat.Upper force limit
      valuecolumns[].valuetableId
    """
    if depth > max_depth:
        return []

    lines: list[str] = []

    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in _SKIP_KEYS:
                lines.append(f"{path}{k}[]  (large array — omitted)")
                continue
            full = f"{path}{k}"
            lines.append(full)
            lines.extend(_extract_keys(v, full + ".", depth + 1, max_depth))

    elif isinstance(obj, list) and obj:
        # Inspect only the first element to infer array item shape
        first = obj[0]
        if isinstance(first, (dict, list)):
            child_prefix = path.rstrip(".") + "[]."
            lines.extend(_extract_keys(first, child_prefix, depth + 1, max_depth))
        # scalar arrays (e.g. tags: ["abc"]) → already captured by parent key

    return lines


def _schema_from_doc(doc: dict, skip_keys: set[str] | None = None) -> str:
    """
    Return a compact field-path listing for one document.
    scalar example values are shown inline (max 40 chars) so the LLM
    knows the data type and format without receiving the full payload.
    """
    if skip_keys is None:
        skip_keys = _SKIP_KEYS

    lines: list[str] = []

    def _walk(obj: object, path: str, depth: int) -> None:
        if depth > 4:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                full = f"{path}{k}"
                if k in skip_keys:
                    lines.append(f"  {full}[]  (large array, omitted from context)")
                    return
                if isinstance(v, dict):
                    lines.append(f"  {full}  {{object}}")
                    _walk(v, full + ".", depth + 1)
                elif isinstance(v, list):
                    if not v:
                        lines.append(f"  {full}  []")
                    elif isinstance(v[0], dict):
                        lines.append(f"  {full}  [array of objects, first item below]")
                        _walk(v[0], full + "[].", depth + 1)
                    else:
                        sample = str(v[0])[:40]
                        lines.append(f"  {full}  [array of scalars, e.g. {sample!r}]")
                else:
                    sample = str(v)[:40]
                    lines.append(f"  {full}: {sample!r}")

    _walk(doc, "", 0)
    return "\n".join(lines)


async def _fetch_schema(db_module, collection: str, exclude_keys: set[str] | None = None) -> str:
    """
    Fetch one document, strip large arrays, return field-path schema string.
    Never puts raw values into context except short scalar previews.
    """
    try:
        docs = await db_module.get_sample_documents(collection=collection, n=1)
        if not docs:
            return "(collection appears empty)"
        doc = docs[0] if isinstance(docs, list) else docs
        return _schema_from_doc(doc, skip_keys=exclude_keys or _SKIP_KEYS)
    except Exception as e:
        return f"(could not fetch schema: {e})"


async def _fetch_test_parameters_flat_keys(db_module) -> str:
    """
    Return just the keys of TestParametersFlat from a sample _tests document.
    This is the only part of _tests that the LLM needs but can't infer from
    the top-level schema walk.
    """
    try:
        docs = await db_module.get_sample_documents(collection="_tests", n=1)
        if not docs:
            return "(no documents found)"
        doc = docs[0] if isinstance(docs, list) else docs
        flat = doc.get("TestParametersFlat") or doc.get("testParametersFlat") or {}
        if not flat:
            return "(TestParametersFlat not present in sample)"
        keys = sorted(flat.keys())
        # Show key + data type + a short example value
        rows = []
        for k in keys:
            v = flat[k]
            sample = str(v)[:30]
            type_hint = type(v).__name__
            rows.append(f"  {k!r:45s} ({type_hint}) e.g. {sample!r}")
        return "\n".join(rows)
    except Exception as e:
        return f"(could not fetch TestParametersFlat keys: {e})"


# ---------------------------------------------------------------------------
# 3.  Main builder — call once at startup
# ---------------------------------------------------------------------------

async def build_db_context(
    db_module,
    channel_map_path: str | None = None,
    result_type_map_path: str | None = None,
) -> str:
    """
    Build the full DB_CONTEXT string to inject into the system prompt.

    Fetches one document per collection at startup, extracts field paths
    (no large array values), and embeds UUID lookup tables from local files
    if paths are provided.

    Args:
        db_module:            your `src.db` module (needs get_sample_documents)
        channel_map_path:     optional path to channelParameterMap JSON/dict
        result_type_map_path: optional path to TestResultTypes JSON/dict

    Returns:
        Compact multi-section string ready to embed in a system prompt.
    """
    global CHANNEL_MAP, RESULT_TYPE_MAP

    CHANNEL_MAP     = _load_channel_map(channel_map_path)     if channel_map_path     else {}
    RESULT_TYPE_MAP = _load_result_type_map(result_type_map_path) if result_type_map_path else {}

    # Fetch key-only schemas (no large arrays, no raw float values)
    schema_tests    = await _fetch_schema(db_module, "_tests",
                                          exclude_keys={"valueColumns", "valuecolumns",
                                                        "values", "valueColumns"})
    schema_migrated = await _fetch_schema(db_module, "valuecolumns_migrated",
                                          exclude_keys={"values"})
    schema_units    = await _fetch_schema(db_module, "unittables_new")

    # TestParametersFlat keys are the most valuable piece — show them fully
    tpf_keys = await _fetch_test_parameters_flat_keys(db_module)

    channel_table     = _build_uuid_table(CHANNEL_MAP)     if CHANNEL_MAP     else "  (no channelParameterMap loaded)"
    result_type_table = _build_uuid_table(RESULT_TYPE_MAP) if RESULT_TYPE_MAP else "  (no TestResultTypes loaded)"

    return f"""
## Database overview

Three collections in MongoDB (all field names are CASE-SENSITIVE):

| Collection               | Purpose                                        |
|--------------------------|------------------------------------------------|
| `_tests`                 | Primary test records — parameters + metadata  |
| `valuecolumns_migrated`  | Time-series float arrays (one doc per channel) |
| `unittables_new`         | Unit definitions referenced by value columns   |

---

## `_tests` — field schema (live, from sample document)

{schema_tests}

### TestParametersFlat — all keys present in sample document

These are the queryable measurement parameters. All key names are CASE-SENSITIVE.

{tpf_keys}

### valuecolumns array — item shape

Each entry in the `valuecolumns` array has these fields:
  _id          : string UUID  — ignore entries ending with `_key`
  valuetableId : UUID         — resolves to a channel or result type (see UUID tables)
  refId        : ObjectId     — back-reference to this test's _id
  childId      : string       — composite: "<valuecolumn._id>.<valuetableId>"

---

## `valuecolumns_migrated` — field schema (live, from sample document)

One document per migrated channel per test. The `values` array is omitted here
— it contains 10 k – 100 k+ raw floats and must be fetched directly when needed.

{schema_migrated}

### JOIN PATTERN — fetching time-series data for a test

Step 1: Query `_tests` for the test document.
        Note: test._id (as string) and the valuecolumn entry where
        valuetableId matches the channel UUID you need.

Step 2: Query `valuecolumns_migrated`:
        {{ "refId": "<test._id as string>",
           "childId": {{ "$regex": "<valuecolumn._id>" }} }}

Step 3: Read `.values[]` — raw float64 samples in chronological order.

Note: `refId` is stored as a STRING in valuecolumns_migrated, not as ObjectId.

---

## `unittables_new` — field schema (live, from sample document)

{schema_units}

---

## UUID reference tables

`valuetableId` in `_tests.valuecolumns` resolves to either a measurement channel
(time-series) or a result type (single scalar value).

Use the `resolve_childId` tool at query time to look up any UUID you encounter.
The tables below are a static reference (first 40 entries each).

### channelParameterMap — measurement channels (time-series)

{channel_table}

### TestResultTypes — scalar result types

{result_type_table}

---

## Query rules (follow strictly)

1. Field names are CASE-SENSITIVE. `SPECIMEN_TYPE` ≠ `specimen_type`.
   A wrong field name returns empty results silently — not an error.

2. Use `resolve_childId` whenever you see a childId or valuetableId UUID.
   Never guess the channel name from the UUID string.

3. `valuecolumn._id` entries ending with `_key` were NOT migrated — skip them.

4. `refId` in `valuecolumns_migrated` is a string. Match it as a string:
   {{"refId": "{{D1CB87C7-...}}"}}  ← correct
   {{"refId": ObjectId("...")}}      ← wrong

5. Fields with spaces are valid: `TestParametersFlat.Upper force limit`

6. Never load the full `values` array unless you specifically need the
   time-series data. Use `valuesCount` to check length first.
"""


# ---------------------------------------------------------------------------
# 4.  Module-level maps (populated by build_db_context at runtime)
# ---------------------------------------------------------------------------

CHANNEL_MAP:     dict[str, str] = {}
RESULT_TYPE_MAP: dict[str, str] = {}


# ---------------------------------------------------------------------------
# 5.  resolve_childId tool
# ---------------------------------------------------------------------------

def _extract_uuids(child_id: str) -> list[str]:
    """Pull all UUID-like tokens out of a childId / valuetableId string."""
    return re.findall(
        r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}",
        child_id,
    )


@tool
def resolve_childId(child_id: str) -> str:
    """
    Resolve a valuecolumn childId or valuetableId UUID to its human-readable
    channel / result-type name.

    Args:
        child_id: Full childId string OR a bare UUID from valuetableId.
                  Examples:
                    "{E4C21909-B178-4fdc-8662-A13B4C7FF756}-Zwick.Unittable.Displacement.{E...}"
                    "{B9D90822-09A8-4eab-871B-70FD0C1B4CD3}"

    Returns:
        JSON string with resolved names for every UUID found in the input,
        distinguishing measurement channels from result types.
    """
    uuids = _extract_uuids(child_id)
    if not uuids:
        return json.dumps({"error": "No UUID found in input", "input": child_id})

    results = []
    for uuid in uuids:
        key = uuid.upper()
        channel_hit = CHANNEL_MAP.get(key)
        result_hit  = RESULT_TYPE_MAP.get(key)

        if channel_hit:
            results.append({"uuid": uuid, "type": "measurement_channel", "name": channel_hit})
        elif result_hit:
            results.append({"uuid": uuid, "type": "result_type", "name": result_hit})
        else:
            results.append({"uuid": uuid, "type": "unknown",
                            "hint": "UUID not found in either map — may be a unit table ID"})

    return json.dumps({"input": child_id, "resolved": results}, indent=2)