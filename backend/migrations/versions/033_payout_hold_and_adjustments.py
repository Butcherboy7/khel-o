"""add cafe payout hold flag and cafe_payout_adjustments ledger

Revision ID: 033
Revises: 032
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cafes', sa.Column('payout_on_hold', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('cafes', sa.Column('payout_hold_reason', sa.String(500), nullable=True))

    op.create_table(
        'cafe_payout_adjustments',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('created_by_admin_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_cafe_payout_adjustments_cafe_id', 'cafe_payout_adjustments', ['cafe_id'])


def downgrade():
    op.drop_index('ix_cafe_payout_adjustments_cafe_id', table_name='cafe_payout_adjustments')
    op.drop_table('cafe_payout_adjustments')
    op.drop_column('cafes', 'payout_hold_reason')
    op.drop_column('cafes', 'payout_on_hold')
