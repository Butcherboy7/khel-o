"""add on_hold and disputed values to cafepayoutstatus enum

Revision ID: 028
Revises: 027
Create Date: 2026-09-09
"""
from alembic import op

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE cafepayoutstatus ADD VALUE IF NOT EXISTS 'on_hold'")
    op.execute("ALTER TYPE cafepayoutstatus ADD VALUE IF NOT EXISTS 'disputed'")


def downgrade():
    # Postgres does not support removing a value from an existing enum type
    # without recreating it, and doing so here would risk breaking any row
    # already using it. Intentional no-op — rolling back this migration
    # leaves the two extra enum values in place, which is harmless.
    pass
