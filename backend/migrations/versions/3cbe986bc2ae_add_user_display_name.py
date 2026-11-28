"""Add a display name for newly registered users."""

import sqlalchemy as sa
from alembic import op


revision = "3cbe986bc2ae"
down_revision = "c6f00d6cc941"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "name")
