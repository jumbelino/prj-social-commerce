from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260307_0003"
down_revision: str | None = "20260306_0002"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("weight_kg", sa.Numeric(precision=10, scale=3), nullable=True),
    )
    op.add_column("product_variants", sa.Column("width_cm", sa.Integer(), nullable=True))
    op.add_column("product_variants", sa.Column("height_cm", sa.Integer(), nullable=True))
    op.add_column("product_variants", sa.Column("length_cm", sa.Integer(), nullable=True))

    op.add_column(
        "orders",
        sa.Column("source", sa.String(length=30), server_default=sa.text("'storefront'"), nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("subtotal_cents", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("shipping_cents", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column("orders", sa.Column("shipping_provider", sa.String(length=30), nullable=True))
    op.add_column("orders", sa.Column("shipping_service_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("shipping_service_name", sa.String(length=120), nullable=True))
    op.add_column("orders", sa.Column("shipping_delivery_days", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("shipping_from_postal_code", sa.String(length=8), nullable=True))
    op.add_column("orders", sa.Column("shipping_to_postal_code", sa.String(length=8), nullable=True))
    op.add_column(
        "orders",
        sa.Column("shipping_quote_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "shipping_quote_json")
    op.drop_column("orders", "shipping_to_postal_code")
    op.drop_column("orders", "shipping_from_postal_code")
    op.drop_column("orders", "shipping_delivery_days")
    op.drop_column("orders", "shipping_service_name")
    op.drop_column("orders", "shipping_service_id")
    op.drop_column("orders", "shipping_provider")
    op.drop_column("orders", "shipping_cents")
    op.drop_column("orders", "subtotal_cents")
    op.drop_column("orders", "source")

    op.drop_column("product_variants", "length_cm")
    op.drop_column("product_variants", "height_cm")
    op.drop_column("product_variants", "width_cm")
    op.drop_column("product_variants", "weight_kg")
