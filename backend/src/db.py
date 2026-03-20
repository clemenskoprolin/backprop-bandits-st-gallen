import json
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Dict, Any, List
import asyncio
import motor.motor_asyncio

# class Settings(BaseSettings):
#     mongodb_uri: str = "mongodb://202.61.251.60:27017"
#     database_name: str = "testdb"
#     collection_name: str = "tests"
#     mcp_server_url: str = "http://localhost:3000/mcp"

#     model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8', extra="ignore")


# settings = Settings()

# client = AsyncIOMotorClient(settings.mongodb_uri)
# db = client[settings.database_name]
# collection = db[settings.collection_name]

client = motor.motor_asyncio.AsyncIOMotorClient(
        host="202.61.251.60",
        port=27017,
        username="admin",
        password="olmamessen1st",
        authSource="admin"
    )
db = client["txp_clean"]
collection = db["_tests"]

async def get_sample_documents(
    collection_name: str = "_tests",
    exclude_keys: list[str] | None = None,
    n: int = 2,
) -> list[dict]:
    """
    Fetch n sample documents from the given collection.
    Excludes specified top-level keys from each document to avoid
    flooding context with large arrays (e.g. valueColumns, values).
 
    Args:
        collection_name: MongoDB collection to sample from.
                         Defaults to "_tests".
        exclude_keys:    Top-level keys to strip from results.
                         Defaults to ["valueColumns", "valuecolumns", "values"].
        n:               Number of documents to return.
    """
    if exclude_keys is None:
        exclude_keys = ["valueColumns", "valuecolumns", "values"]
 
    # Build MongoDB projection: _id excluded, large keys excluded
    projection = {"_id": 0}
    for key in exclude_keys:
        projection[key] = 0
 
    # db is the module-level AsyncIOMotorDatabase ("txp_clean")
    col = db[collection_name]
    cursor = col.find({}, projection).limit(n)
 
    results = []
    async for doc in cursor:
        results.append(doc)
    return results

async def aggregate_for_recharts(group_by: str, aggregations: Dict[str, Any], match_filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Builds an aggregation pipeline optimized for Recharts (array of dicts).
    `group_by`: the field to group by (e.g., "$TestParametersFlat.Specimen type")
    `aggregations`: dictionary of field names mapped to operators (e.g. {"avgForce": {"$avg": "$TestParametersFlat.Upper force limit"}})
    """
    pipeline = []
    if match_filters:
        pipeline.append({"$match": match_filters})

    group_stage = {"_id": group_by}
    for key, spec in aggregations.items():
        group_stage[key] = spec

    pipeline.append({"$group": group_stage})

    # Project to make it Recharts friendly (rename _id to name)
    project_stage = {
        "name": "$_id",
        "_id": 0
    }
    for key in aggregations.keys():
        project_stage[key] = 1

    pipeline.append({"$project": project_stage})

    cursor = collection.aggregate(pipeline)
    results = []
    async for doc in cursor:
        results.append(doc)
    return results


# async def main():
#     client = motor.motor_asyncio.AsyncIOMotorClient(
#         host="202.61.251.60",
#         port=27017,
#         username="admin",
#         password="olmamessen1st",
#         authSource="admin"
#     )

#     db = client["txp_clean"]
#     collection = db["_tests"]

#     # Find one
#     doc = await collection.find_one()
#     collections = await db.list_collection_names()
#     print(collections)
#     print(doc)

#     client.close()

# asyncio.run(main())