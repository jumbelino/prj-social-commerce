from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260324_0004"
down_revision: str | None = "691f2da8ad73"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("inventory_released_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(
        """
        UPDATE orders
        SET expires_at = created_at + INTERVAL '30 minutes'
        WHERE status = 'pending' AND expires_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE orders
        SET status = 'paid'
        WHERE status = 'confirmed'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE orders
        SET status = 'confirmed'
        WHERE status = 'paid'
        """
    )
    op.drop_column("orders", "inventory_released_at")
    op.drop_column("orders", "expires_at")
