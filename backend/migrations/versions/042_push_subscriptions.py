"""push subscriptions table and notifications.dedupe_key

Revision ID: 042
Revises: 041
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('endpoint', sa.String(512), nullable=False),
        sa.Column('p256dh_key', sa.String(255), nullable=False),
        sa.Column('auth_key', sa.String(255), nullable=False),
        sa.Column('user_agent', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('endpoint', name='uq_push_subscriptions_endpoint'),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])

    # Nullable with no default, so every existing row keeps NULL and the
    # partial index below ignores them all.
    op.add_column('notifications', sa.Column('dedupe_key', sa.String(128), nullable=True))
    op.create_index(
        'uq_notifications_user_dedupe',
        'notifications',
        ['user_id', 'dedupe_key'],
        unique=True,
        sqlite_where=sa.text('dedupe_key IS NOT NULL'),
        postgresql_where=sa.text('dedupe_key IS NOT NULL'),
    )


def downgrade():
    op.drop_index('uq_notifications_user_dedupe', table_name='notifications')
    op.drop_column('notifications', 'dedupe_key')
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
