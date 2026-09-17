"""add platform_settings.reviews_require_booking (temporary admin toggle)

Revision ID: 038
Revises: 037
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = '038'
down_revision = '037'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'platform_settings',
        sa.Column('reviews_require_booking', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade():
    op.drop_column('platform_settings', 'reviews_require_booking')
