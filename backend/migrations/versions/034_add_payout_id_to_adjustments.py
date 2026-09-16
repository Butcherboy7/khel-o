"""add payout_id to cafe_payout_adjustments to mark adjustments consumed by a payout

Revision ID: 034
Revises: 033
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = '034'
down_revision = '033'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'cafe_payout_adjustments',
        sa.Column('payout_id', sa.Uuid(), sa.ForeignKey('cafe_payouts.id'), nullable=True),
    )
    op.create_index('ix_cafe_payout_adjustments_payout_id', 'cafe_payout_adjustments', ['payout_id'])


def downgrade():
    op.drop_index('ix_cafe_payout_adjustments_payout_id', table_name='cafe_payout_adjustments')
    op.drop_column('cafe_payout_adjustments', 'payout_id')
