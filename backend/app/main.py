from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI

from .api import (
    admin_product_images_router,
    admin_orders_router,
    orders_router,
    payments_router,
    products_router,
    shipping_router,
    webhooks_router,
)
from .auth import Principal, require_admin
from .core.config import get_settings
from .core.cors import configure_cors
from .core.health import health_router

settings = get_settings()

app = FastAPI(title=settings.app_name)
configure_cors(app, settings)
app.include_router(health_router)
app.include_router(products_router)
app.include_router(orders_router)
app.include_router(shipping_router)
app.include_router(payments_router)
app.include_router(webhooks_router)
app.include_router(admin_product_images_router)
app.include_router(admin_orders_router)

admin_router = APIRouter(prefix="/admin", tags=["admin"])


@admin_router.get("/ping")
def admin_ping(
    principal: Annotated[Principal, Depends(require_admin)],
) -> dict[str, object]:
    return {
        "status": "ok",
        "subject": principal.subject,
        "roles": list(principal.roles),
        "is_admin": principal.is_admin,
    }


app.include_router(admin_router)
