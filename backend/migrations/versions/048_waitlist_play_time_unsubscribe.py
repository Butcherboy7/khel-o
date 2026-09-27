"""cafe_waitlist: play_time answer and email unsubscribe

Revision ID: 048
Revises: 047
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = '048'
down_revision = '047'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cafe_waitlist', sa.Column('play_time', sa.String(20), nullable=True))
    op.add_column('cafe_waitlist', sa.Column('unsubscribed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('cafe_waitlist', 'unsubscribed_at')
    op.drop_column('cafe_waitlist', 'play_time')
