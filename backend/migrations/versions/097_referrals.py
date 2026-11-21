"""Referrals and first-booking credits (welcome, community code, friend reward)

Revision ID: 097
Revises: 096
Create Date: 2026-11-21
"""
import sqlalchemy as sa
from alembic import op

revision = '097'
down_revision = '096'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('platform_settings', sa.Column('referrals_on', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('platform_settings', sa.Column('welcome_credit', sa.Integer(), nullable=False, server_default='15'))
    op.add_column('platform_settings', sa.Column('community_code', sa.String(20), nullable=True))
    op.add_column('platform_settings', sa.Column('community_credit', sa.Integer(), nullable=False, server_default='15'))
    op.add_column('platform_settings', sa.Column('referral_reward', sa.Integer(), nullable=False, server_default='15'))

    op.add_column('bookings', sa.Column('khelo_credit', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('bookings', sa.Column('credit_note', sa.String(60), nullable=True))
    op.add_column('bookings', sa.Column('referral_credit_id', sa.Uuid(), nullable=True))

    op.create_table(
        'referrals',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('referrer_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('referred_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False, unique=True),
        sa.Column('code', sa.String(10), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, server_default='joined'),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=True),
        sa.Column('rewarded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('void_reason', sa.String(120), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_referrals_referrer_id', 'referrals', ['referrer_id'])

    op.create_table(
        'referral_credits',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('referral_id', sa.Uuid(), sa.ForeignKey('referrals.id'), nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, server_default='available'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_referral_credits_user_id', 'referral_credits', ['user_id'])


def downgrade():
    op.drop_index('ix_referral_credits_user_id', 'referral_credits')
    op.drop_table('referral_credits')
    op.drop_index('ix_referrals_referrer_id', 'referrals')
    op.drop_table('referrals')
    for c in ('referral_credit_id', 'credit_note', 'khelo_credit'):
        op.drop_column('bookings', c)
    for c in ('referral_reward', 'community_credit', 'community_code', 'welcome_credit', 'referrals_on'):
        op.drop_column('platform_settings', c)
