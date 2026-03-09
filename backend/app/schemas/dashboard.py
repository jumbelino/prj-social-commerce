from pydantic import BaseModel


class DashboardMetrics(BaseModel):
    order_count: int
    sales_total_cents: int
    active_products: int
    customer_count: int
