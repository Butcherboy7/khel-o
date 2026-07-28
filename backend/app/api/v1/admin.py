from fastapi import APIRouter

router = APIRouter()

@router.get("/dashboard")
async def get_admin_dashboard():
    return {"message": "Admin Dashboard Analytics Endpoint"}
