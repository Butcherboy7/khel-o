"""add settlement tracking fields to platform_fees

Revision ID: 039
Revises: 038
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = '039'
down_revision = '038'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'platform_fees',
        sa.Column('settlement_status', sa.String(20), nullable=False, server_default='pending_settlement'),
    )
    op.add_column('platform_fees', sa.Column('razorpay_settlement_id', sa.String(100), nullable=True))
    op.add_column('platform_fees', sa.Column('settled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('platform_fees', sa.Column('excluded_reason', sa.String(200), nullable=True))
    op.create_index('ix_platform_fees_settlement_status', 'platform_fees', ['settlement_status'])

    # A payout auto-created by the weekly allocation job has no UTR/method
    # yet — the admin fills those in when they record the actual transfer.
    op.alter_column('cafe_payouts', 'utr_reference', existing_type=sa.String(100), nullable=True)
    op.alter_column('cafe_payouts', 'payment_method', existing_type=sa.String(50), nullable=True)


def downgrade():
    op.alter_column('cafe_payouts', 'payment_method', existing_type=sa.String(50), nullable=False)
    op.alter_column('cafe_payouts', 'utr_reference', existing_type=sa.String(100), nullable=False)
    op.drop_index('ix_platform_fees_settlement_status', table_name='platform_fees')
    op.drop_column('platform_fees', 'excluded_reason')
    op.drop_column('platform_fees', 'settled_at')
    op.drop_column('platform_fees', 'razorpay_settlement_id')
    op.drop_column('platform_fees', 'settlement_status')
