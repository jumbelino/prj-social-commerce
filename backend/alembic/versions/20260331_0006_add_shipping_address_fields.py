from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260331_0006"
down_revision: str | None = "20260325_0005"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("shipping_address_street", sa.String(255), nullable=True))
    op.add_column("orders", sa.Column("shipping_address_number", sa.String(20), nullable=True))
    op.add_column("orders", sa.Column("shipping_address_complement", sa.String(120), nullable=True))
    op.add_column("orders", sa.Column("shipping_address_neighborhood", sa.String(120), nullable=True))
    op.add_column("orders", sa.Column("shipping_address_city", sa.String(120), nullable=True))
    op.add_column("orders", sa.Column("shipping_address_state", sa.String(2), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "shipping_address_state")
    op.drop_column("orders", "shipping_address_city")
    op.drop_column("orders", "shipping_address_neighborhood")
    op.drop_column("orders", "shipping_address_complement")
    op.drop_column("orders", "shipping_address_number")
    op.drop_column("orders", "shipping_address_street")
