"""add booking release fields and RELEASED_BY_OWNER status

Revision ID: 022
Revises: 021
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa

revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('bookings', sa.Column('released_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('bookings', sa.Column('released_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('release_reason', sa.String(255), nullable=True))
    op.execute("ALTER TYPE bookingstatus ADD VALUE IF NOT EXISTS 'released_by_owner'")


def downgrade():
    op.drop_column('bookings', 'release_reason')
    op.drop_column('bookings', 'released_at')
    op.drop_column('bookings', 'released_by')
    # Postgres cannot drop an enum value; leaving 'released_by_owner' in
    # place on downgrade is intentional (matches this repo's convention of
    # not reversing enum additions in other migrations' downgrade()).
