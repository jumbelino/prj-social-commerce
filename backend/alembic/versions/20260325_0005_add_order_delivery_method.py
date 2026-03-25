from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260325_0005"
down_revision: str | None = "20260324_0004"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("delivery_method", sa.String(length=20), server_default=sa.text("'shipping'"), nullable=False),
    )
    op.execute(
        """
        UPDATE orders
        SET delivery_method = 'shipping'
        WHERE delivery_method IS NULL OR delivery_method = ''
        """
    )


def downgrade() -> None:
    op.drop_column("orders", "delivery_method")
