"""GTA 6 slot requests + the launch switch on platform_settings

Revision ID: 094
Revises: 093
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

revision = '094'
down_revision = '093'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('platform_settings', sa.Column('gta6_requests_on', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('platform_settings', sa.Column('gta6_requests_until', sa.Date(), nullable=True))
    op.add_column('platform_settings', sa.Column('gta6_whatsapp', sa.String(20), nullable=True))
    op.create_table(
        'gta6_slot_requests',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('reference', sa.String(12), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('tier_id', sa.Uuid(), sa.ForeignKey('hardware_tiers.id'), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('hours', sa.Float(), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('status', sa.String(12), nullable=False, server_default='requested'),
        sa.Column('admin_note', sa.Text(), nullable=True),
        sa.Column('suggestion', sa.Text(), nullable=True),
        sa.Column('booking_id', sa.Uuid(), sa.ForeignKey('bookings.id'), nullable=True),
        sa.Column('decided_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_gta6_slot_requests_reference', 'gta6_slot_requests', ['reference'], unique=True)
    op.create_index('ix_gta6_slot_requests_user_id', 'gta6_slot_requests', ['user_id'])
    op.create_index('ix_gta6_slot_requests_cafe_id', 'gta6_slot_requests', ['cafe_id'])
    op.create_index('ix_gta6_slot_requests_status', 'gta6_slot_requests', ['status'])


def downgrade():
    op.drop_table('gta6_slot_requests')
    op.drop_column('platform_settings', 'gta6_whatsapp')
    op.drop_column('platform_settings', 'gta6_requests_until')
    op.drop_column('platform_settings', 'gta6_requests_on')
