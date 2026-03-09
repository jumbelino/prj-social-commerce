from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.dependencies import Principal, require_admin
from ..db.session import get_db_session
from ..models.customer import Customer
from ..models.order import Order
from ..schemas.customers import CustomerRead, CustomerWithOrders
from ..schemas.orders import OrderRead

admin_customers_router = APIRouter(prefix="/admin/customers", tags=["admin-customers"])


@admin_customers_router.get("", response_model=list[CustomerRead])
def list_admin_customers(
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Customer]:
    stmt = select(Customer)
    if query:
        search_term = f"%{query}%"
        stmt = stmt.where(
            (Customer.name.ilike(search_term))
            | (Customer.email.ilike(search_term))
            | (Customer.phone.ilike(search_term))
        )
    stmt = stmt.order_by(Customer.id.desc()).limit(limit).offset(offset)
    customers = db.execute(stmt).scalars().all()
    return customers


@admin_customers_router.get("/{customer_id}", response_model=CustomerWithOrders)
def get_admin_customer(
    customer_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> CustomerWithOrders:
    stmt = select(Customer).where(Customer.id == customer_id)
    customer = db.execute(stmt).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="customer not found")

    orders_stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.customer_name == customer.name)
        .where(Order.customer_email == customer.email)
        .order_by(Order.created_at.desc())
    )
    orders = db.execute(orders_stmt).scalars().all()
    return CustomerWithOrders(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        orders=orders,
        total_orders=len(orders),
    )


@admin_customers_router.get("/{customer_id}/orders", response_model=list[OrderRead])
def get_admin_customer_orders(
    customer_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    customer_stmt = select(Customer).where(Customer.id == customer_id)
    customer = db.execute(customer_stmt).scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="customer not found")

    orders_stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.customer_name == customer.name)
        .where(Order.customer_email == customer.email)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    orders = db.execute(orders_stmt).scalars().all()
    return orders
