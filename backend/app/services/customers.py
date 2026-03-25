from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.customer import Customer


def upsert_customer(
    db: Session,
    *,
    name: str | None,
    email: str | None,
    phone: str | None,
) -> Customer | None:
    normalized_name = None if name is None else name.strip()
    normalized_email = None if email is None else email.strip().lower()
    normalized_phone = None if phone is None else phone.strip()

    if normalized_name == "":
        normalized_name = None
    if normalized_email == "":
        normalized_email = None
    if normalized_phone == "":
        normalized_phone = None

    customer: Customer | None = None
    if normalized_email is not None:
        customer = db.execute(
            select(Customer)
            .where(func.lower(Customer.email) == normalized_email)
            .with_for_update()
        ).scalar_one_or_none()

    if customer is None:
        if normalized_name is None and normalized_email is None and normalized_phone is None:
            return None

        customer = Customer(
            name=normalized_name or normalized_email or normalized_phone or "Cliente sem identificacao",
            email=normalized_email,
            phone=normalized_phone,
        )
        db.add(customer)
        db.flush()
        return customer

    if normalized_name is not None:
        customer.name = normalized_name
    elif customer.name.strip() == "" and normalized_email is not None:
        customer.name = normalized_email

    if normalized_email is not None:
        customer.email = normalized_email
    if normalized_phone is not None:
        customer.phone = normalized_phone

    db.add(customer)
    db.flush()
    return customer
