"""Add analytics foundation: user acquisition fields, booking.game, analytics_events

Revision ID: 019
Revises: 018
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa

revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_source', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_medium', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('acquisition_campaign', sa.String(100), nullable=True))

    op.add_column('bookings', sa.Column('game', sa.String(100), nullable=True))

    op.create_table(
        'analytics_events',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('cafe_id', sa.Uuid(), sa.ForeignKey('cafes.id'), nullable=True),
        sa.Column('event_metadata', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_analytics_events_session_id', 'analytics_events', ['session_id'])
    op.create_index('ix_analytics_events_user_id', 'analytics_events', ['user_id'])
    op.create_index('ix_analytics_events_event_type', 'analytics_events', ['event_type'])
    op.create_index('ix_analytics_events_created_at', 'analytics_events', ['created_at'])


def downgrade():
    op.drop_index('ix_analytics_events_created_at', table_name='analytics_events')
    op.drop_index('ix_analytics_events_event_type', table_name='analytics_events')
    op.drop_index('ix_analytics_events_user_id', table_name='analytics_events')
    op.drop_index('ix_analytics_events_session_id', table_name='analytics_events')
    op.drop_table('analytics_events')

    op.drop_column('bookings', 'game')

    op.drop_column('users', 'acquisition_campaign')
    op.drop_column('users', 'acquisition_medium')
    op.drop_column('users', 'acquisition_source')
    op.drop_column('users', 'city')
