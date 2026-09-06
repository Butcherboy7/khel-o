"""add cafe_payouts and cafe_payout_items

Revision ID: 020
Revises: 019
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cafe_payouts',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('utr_reference', sa.String(100), nullable=False),
        sa.Column('payment_method', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='paid'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_admin_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_cafe_payouts_cafe_id', 'cafe_payouts', ['cafe_id'])

    op.create_table(
        'cafe_payout_items',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('payout_id', sa.Uuid(), sa.ForeignKey('cafe_payouts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('platform_fee_id', sa.Uuid(), sa.ForeignKey('platform_fees.id'), nullable=False),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('amount_allocated', sa.Numeric(10, 2), nullable=False),
    )
    op.create_index('ix_cafe_payout_items_payout_id', 'cafe_payout_items', ['payout_id'])
    op.create_index('ix_cafe_payout_items_platform_fee_id', 'cafe_payout_items', ['platform_fee_id'], unique=True)


def downgrade():
    op.drop_table('cafe_payout_items')
    op.drop_table('cafe_payouts')
