"""photos for each setup

A café can show photos under each setup (PS5, PC, VR, racing...), so a gamer
can see what they will play on. Additive and defaulted: every existing setup
starts with no photos.

Revision ID: 087
Revises: 086
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = '087'
down_revision = '086'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('photos', sa.JSON(), server_default='[]', nullable=False))


def downgrade():
    op.drop_column('hardware_tiers', 'photos')
