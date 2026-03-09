from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "691f2da8ad73"
down_revision: str | None = "20260307_0003"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column(
        "customers",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "customers",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("customers", "is_active")
    op.drop_column("customers", "updated_at")
    op.drop_column("customers", "created_at")
