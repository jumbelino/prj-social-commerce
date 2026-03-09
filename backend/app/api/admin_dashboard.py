# pyright: reportMissingImports=false

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth.dependencies import Principal, require_admin
from ..db.session import get_db_session
from ..models.customer import Customer
from ..models.order import Order
from ..models.product import Product
from ..schemas.dashboard import DashboardMetrics

admin_dashboard_router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@admin_dashboard_router.get("/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
    start_date: date | None = None,
    end_date: date | None = None,
) -> DashboardMetrics:
    order_stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total_cents), 0))
    if start_date is not None:
        order_stmt = order_stmt.where(Order.created_at >= start_date)
    if end_date is not None:
        order_stmt = order_stmt.where(Order.created_at <= end_date)

    order_result = db.execute(order_stmt).one()
    order_count = order_result[0] or 0
    sales_total_cents = order_result[1] or 0

    active_products_result = db.execute(
        select(func.count(Product.id)).where(Product.active == True)
    ).scalar()
    active_products = active_products_result or 0

    customer_count = db.execute(select(func.count(Customer.id))).scalar() or 0

    return DashboardMetrics(
        order_count=order_count,
        sales_total_cents=sales_total_cents,
        active_products=active_products,
        customer_count=customer_count,
    )
