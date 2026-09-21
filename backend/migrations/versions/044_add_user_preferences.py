"""users.preferences JSON column

Revision ID: 044
Revises: 043
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('preferences', sa.JSON(), nullable=False, server_default='{}'),
    )


def downgrade():
    op.drop_column('users', 'preferences')
