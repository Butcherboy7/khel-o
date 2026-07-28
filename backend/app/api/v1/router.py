from fastapi import APIRouter

api_router = APIRouter()

@api_router.get("/status", tags=["Status"])
async def get_v1_status():
    return {"message": "KHEL-O API v1 Operational"}
