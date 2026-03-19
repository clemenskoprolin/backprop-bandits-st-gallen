import os
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Dict, Any, List
import asyncio

class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://202.61.251.60:27017"
    database_name: str = "testdb"
    collection_name: str = "tests"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8',extra="ignore")

settings = Settings()

client = AsyncIOMotorClient(settings.mongodb_uri)
db = client[settings.database_name]
collection = db[settings.collection_name]

async def test_connection():
    try:
        await client.admin.command('ping')
        return True
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return False

async def get_test(test_id: str) -> Optional[Dict[str, Any]]:
    test = await collection.find_one({"_id": test_id})
    return test

async def search_tests(filters: Dict[str, Any], limit: int = 20) -> List[Dict[str, Any]]:
    cursor = collection.find(filters or {}).limit(limit)
    tests = []
    async for test in cursor:
        tests.append(test)
    return [{
  "_id": "{D1CB87C7-D89F-4583-9DA8-5372DC59F25A}",
  "hasMachineConfigurationInfo": False,
  "testProgramId": "TestProgram_2",
  "testProgramVersion": "2.1772195387.0",
  "name": "01",
  "modifiedOn": {},
  "TestParametersFlat": {
    "TYPE_OF_TESTING_STR": "tensile",
    "MACHINE_TYPE_STR": "Static",
    "STANDARD": "DIN EN ",
    "TESTER": "Tester_1",
    "NOTES": "Auswertung E-Modul nach ClipOn Punkten",
    "Wall thickness": 0.002,
    "SPECIMEN_THICKNESS": 0.001925,
    }}]

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

async def main():
    print("Trying to connect")
    connection_success = await test_connection()
    print(connection_success)
    tmp = await search_tests(None)
    print(tmp)

if __name__ == "__main__":
    asyncio.run(main())