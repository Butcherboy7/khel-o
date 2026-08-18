"""Add owner_reply and owner_replied_at to reviews table

Revision ID: 014
Revises: 013
Create Date: 2026-08-18

"""
from alembic import op
import sqlalchemy as sa

revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('reviews')]

    if 'owner_reply' not in columns:
        op.add_column('reviews', sa.Column('owner_reply', sa.Text(), nullable=True))
    if 'owner_replied_at' not in columns:
        op.add_column('reviews', sa.Column('owner_replied_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('reviews', 'owner_replied_at')
    op.drop_column('reviews', 'owner_reply')
