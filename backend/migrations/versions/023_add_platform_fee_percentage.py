"""Add Super Admin-controlled platform_fee_percentage and per-booking fee_percentage_applied

Revision ID: 023
Revises: 022
Create Date: 2026-09-07

"""
from alembic import op
import sqlalchemy as sa

revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'platform_settings',
        sa.Column('platform_fee_percentage', sa.Numeric(5, 2), nullable=False, server_default='4.00'),
    )
    op.add_column(
        'platform_fees',
        sa.Column('fee_percentage_applied', sa.Numeric(5, 2), nullable=False, server_default='4.00'),
    )


def downgrade():
    op.drop_column('platform_fees', 'fee_percentage_applied')
    op.drop_column('platform_settings', 'platform_fee_percentage')
