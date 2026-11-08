"""Join the walk-in review fix (073r, from main) with the drops chain (073 to 080).

Revision ID: 081
Revises: 080, 073r
"""
from alembic import op  # noqa: F401

revision = '081'
down_revision = ('080', '073r')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
