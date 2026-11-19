"""GTA 6 requests remember the game asked for and the console the player picked

Revision ID: 095
Revises: 094
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = '095'
down_revision = '094'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('gta6_slot_requests', sa.Column('game', sa.String(8), nullable=False, server_default='gta6'))
    op.add_column('gta6_slot_requests', sa.Column('console_label', sa.String(60), nullable=True))


def downgrade():
    op.drop_column('gta6_slot_requests', 'console_label')
    op.drop_column('gta6_slot_requests', 'game')
