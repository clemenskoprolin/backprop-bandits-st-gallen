from fastmcp import FastMCP
from typing import Optional, Dict, Any
import json
from src import db

mcp = FastMCP("Test Results Database Server")

@mcp.tool()
async def get_test(test_id: str) -> str:
    """
    Get the full details of a specific test by its ID.
    """
    test = await db.get_test(test_id)
    if not test:
        return f"Test with ID {test_id} not found."
    test["_id"] = str(test["_id"])
    return json.dumps(test, default=str)

@mcp.tool()
async def search_tests(
    app_type: Optional[str] = None, 
    state: Optional[str] = None, 
    limit: int = 10
) -> str:
    """
    Search for tests based on basic metadata filters. Only returns a few records to avoid context limits.
    For visualizing trends across many tests, use get_aggregated_data_for_chart instead.
    """
    filters = {}
    if app_type:
        filters["clientAppType"] = app_type
    if state:
        filters["state"] = state
        
    tests = await db.search_tests(filters, limit)
    for t in tests:
        t["_id"] = str(t["_id"])
    return json.dumps(tests, default=str)

@mcp.tool()
async def get_aggregated_data_for_chart(
    group_by_field: str, 
    aggregations: str, 
    match_filters: Optional[str] = None
) -> str:
    """
    Get aggregated test data formatted nicely for Recharts visualization.
    Returns JSON string representing array of objects: [{"name": "Group A", "value1": 10}, {"name": "Group B", "value1": 20}]
    
    Args:
        group_by_field: MongoDB document path to group by. Example: "$TestParametersFlat.SPECIMEN_TYPE"
        aggregations: JSON string of MongoDB aggregation operations. Example: '{"avgForce": {"$avg": "$TestParametersFlat.Upper force limit"}}'
        match_filters: Optional JSON string of MongoDB match filters to apply before aggregating. Example: '{"state": "finishedOK"}'
    """
    import json
    
    try:
        agg_dict = json.loads(aggregations) if aggregations else {}
        match_dict = json.loads(match_filters) if match_filters else None
    except json.JSONDecodeError as e:
        return f"Error: Failed to parse JSON arguments: {e}"

    results = await db.aggregate_for_recharts(group_by_field, agg_dict, match_dict)
    return json.dumps(results, default=str)

if __name__ == "__main__":
    mcp.run()
