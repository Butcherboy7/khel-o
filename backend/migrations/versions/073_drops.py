"""drops: limited pre-booked launch events (e.g. GTA 6 Launch Drop)

Four new tables, so additive: nothing existing changes. Downgrade drops them
(never run without approval).

Revision ID: 073
Revises: 072
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa


revision = '073'
down_revision = '072'
branch_labels = None
depends_on = None


def _ts(name, nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable,
                     server_default=None if nullable else sa.func.now())


def upgrade():
    op.create_table(
        'drops',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('slug', sa.String(length=60), nullable=False),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('game', sa.String(length=80), nullable=False),
        sa.Column('cover_image_url', sa.String(length=1000), nullable=True),
        sa.Column('tagline', sa.String(length=160), nullable=True),
        sa.Column('price_per_hour', sa.Numeric(10, 2), nullable=False),
        sa.Column('deposit_amount', sa.Numeric(10, 2), nullable=False, server_default='99'),
        sa.Column('max_seats_per_user', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('early_access_code', sa.String(length=40), nullable=True),
        sa.Column('early_access_starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('public_starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=12), nullable=False, server_default='draft'),
        _ts('cancelled_at', nullable=True),
        sa.Column('cancel_reason', sa.Text(), nullable=True),
        _ts('created_at'),
        _ts('updated_at'),
    )
    op.create_index('ix_drops_slug', 'drops', ['slug'], unique=True)
    op.create_index('ix_drops_cafe_id', 'drops', ['cafe_id'])

    op.create_table(
        'drop_blocks',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('drop_id', sa.UUID(), sa.ForeignKey('drops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('seats_total', sa.Integer(), nullable=False),
        sa.Column('seats_taken', sa.Integer(), nullable=False, server_default='0'),
        _ts('created_at'),
        sa.CheckConstraint('end_time > start_time', name='ck_drop_blocks_same_day'),
        sa.CheckConstraint('seats_taken >= 0 AND seats_taken <= seats_total', name='ck_drop_blocks_seats'),
    )
    op.create_index('ix_drop_blocks_drop_id', 'drop_blocks', ['drop_id'])

    op.create_table(
        'drop_reservations',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('reference', sa.String(length=20), nullable=False),
        sa.Column('drop_id', sa.UUID(), sa.ForeignKey('drops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('block_id', sa.UUID(), sa.ForeignKey('drop_blocks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending_payment'),
        sa.Column('block_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('deposit_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('balance_due', sa.Numeric(10, 2), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('razorpay_order_id', sa.String(length=64), nullable=True),
        sa.Column('razorpay_payment_id', sa.String(length=64), nullable=True),
        _ts('paid_at', nullable=True),
        sa.Column('refund_id', sa.String(length=64), nullable=True),
        _ts('refunded_at', nullable=True),
        sa.Column('refund_reason', sa.Text(), nullable=True),
        sa.Column('checkin_token', sa.String(length=40), nullable=False),
        _ts('checked_in_at', nullable=True),
        sa.Column('checked_in_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('used_early_access', sa.Boolean(), nullable=False, server_default=sa.false()),
        _ts('created_at'),
        _ts('updated_at'),
    )
    op.create_index('ix_drop_reservations_reference', 'drop_reservations', ['reference'], unique=True)
    op.create_index('ix_drop_reservations_checkin_token', 'drop_reservations', ['checkin_token'], unique=True)
    op.create_index('uq_drop_reservations_order', 'drop_reservations', ['razorpay_order_id'], unique=True)
    op.create_index('ix_drop_reservations_drop_id', 'drop_reservations', ['drop_id'])
    op.create_index('ix_drop_reservations_block_id', 'drop_reservations', ['block_id'])
    op.create_index('ix_drop_reservations_user_id', 'drop_reservations', ['user_id'])
    op.create_index('ix_drop_reservations_status', 'drop_reservations', ['status'])

    op.create_table(
        'drop_waitlist',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('drop_id', sa.UUID(), sa.ForeignKey('drops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=True),
        _ts('created_at'),
        sa.UniqueConstraint('drop_id', 'phone', name='uq_drop_waitlist_phone'),
    )
    op.create_index('ix_drop_waitlist_drop_id', 'drop_waitlist', ['drop_id'])


def downgrade():
    op.drop_table('drop_waitlist')
    op.drop_table('drop_reservations')
    op.drop_table('drop_blocks')
    op.drop_table('drops')
