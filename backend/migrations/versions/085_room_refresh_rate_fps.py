"""setups: cabin/room flag, refresh rate and owner FPS numbers

All additive and nullable/defaulted, so every existing setup keeps working untouched:
- is_room: a private room booked as one unit, priced room fee + machines (reuses co-op maths)
- refresh_rate_hz: the screen speed players ask about first
- fps_overrides: FPS the owner measured, per game

Revision ID: 085
Revises: 084
Create Date: 2026-11-12
"""
from alembic import op
import sqlalchemy as sa

revision = '085'
down_revision = '084'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('is_room', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('hardware_tiers', sa.Column('refresh_rate_hz', sa.Integer(), nullable=True))
    op.add_column('hardware_tiers', sa.Column('fps_overrides', sa.JSON(), server_default='{}', nullable=False))


def downgrade():
    op.drop_column('hardware_tiers', 'fps_overrides')
    op.drop_column('hardware_tiers', 'refresh_rate_hz')
    op.drop_column('hardware_tiers', 'is_room')
