from fastapi import APIRouter

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
