"""Founder-confirmed GTA 6 slot offers shared as links

Revision ID: 096
Revises: 095
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = '096'
down_revision = '095'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gta6_slot_offers',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('token', sa.String(24), nullable=False),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('tier_id', sa.Uuid(), sa.ForeignKey('hardware_tiers.id'), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('hours', sa.Float(), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('game', sa.String(8), nullable=False, server_default='gta6'),
        sa.Column('status', sa.String(12), nullable=False, server_default='open'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('claimed_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_gta6_slot_offers_token', 'gta6_slot_offers', ['token'], unique=True)
    op.create_index('ix_gta6_slot_offers_cafe_id', 'gta6_slot_offers', ['cafe_id'])
    op.create_index('ix_gta6_slot_offers_status', 'gta6_slot_offers', ['status'])


def downgrade():
    op.drop_table('gta6_slot_offers')
