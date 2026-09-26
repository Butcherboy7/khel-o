"""users.guide_state JSON column for owner/staff in-app guidance

Revision ID: 046
Revises: 045
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa

revision = '046'
down_revision = '045'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('guide_state', sa.JSON(), nullable=False, server_default='{}'),
    )


def downgrade():
    op.drop_column('users', 'guide_state')
