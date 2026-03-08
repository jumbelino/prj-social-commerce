from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260306_0002"
down_revision: str | None = "20260306_0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_payments_provider_order_id",
        "payments",
        ["provider", "order_id"],
    )
    op.create_index(
        "uq_payments_provider_external_id_not_null",
        "payments",
        ["provider", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_payments_provider_external_id_not_null", table_name="payments")
    op.drop_constraint("uq_payments_provider_order_id", "payments", type_="unique")
