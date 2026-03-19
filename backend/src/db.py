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
}
,
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
}]

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