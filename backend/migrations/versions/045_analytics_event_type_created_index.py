"""composite index for per-period analytics queries

The admin Traffic page filters analytics_events by event_type within a
created_at window on every load; page_view makes this the table's hottest
path, so give it a composite index instead of two single-column ones.

Revision ID: 045
Revises: 044
Create Date: 2026-09-26
"""
from alembic import op

revision = '045'
down_revision = '044'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_analytics_events_type_created_at', 'analytics_events', ['event_type', 'created_at'],
    )


def downgrade():
    op.drop_index('ix_analytics_events_type_created_at', table_name='analytics_events')
