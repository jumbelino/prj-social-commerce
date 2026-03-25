from .admin_customers import admin_customers_router
from .admin_dashboard import admin_dashboard_router
from .admin_orders import admin_orders_router
from .admin_product_images import admin_product_images_router
from .admin_product_images import admin_product_images_router
from .checkout import checkout_router
from .orders import orders_router
from .payments import payments_router
from .products import products_router
from .shipping import shipping_router
from .webhooks import webhooks_router

__all__ = [
    "admin_customers_router",
    "admin_dashboard_router",
    "admin_orders_router",
    "admin_product_images_router",
    "checkout_router",
    "orders_router",
    "payments_router",
    "products_router",
    "shipping_router",
    "webhooks_router",
]
