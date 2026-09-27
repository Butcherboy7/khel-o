"""co-op (shared console) pricing, per-setup booking minutes, offer play mode

Revision ID: 050
Revises: 049
Create Date: 2026-09-28

hardware_tiers: an owner can let 2-4 friends share one console for a charge
per extra player, and set the shortest and default booking length per setup
(VR sessions are often 15 minutes, a PS5 session an hour).
bookings.players_count: people playing. A booking is co-op when it has more
players than consoles (seats_count stays the number of consoles held).
promotions.play_mode: 'any' | 'solo' (own console) | 'coop' (sharing one).
"""
from alembic import op
import sqlalchemy as sa

revision = '050'
down_revision = '049'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('coop_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('hardware_tiers', sa.Column('coop_max_players', sa.Integer(), nullable=False, server_default='2'))
    op.add_column('hardware_tiers', sa.Column('coop_extra_player_price', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('hardware_tiers', sa.Column('min_booking_minutes', sa.Integer(), nullable=False, server_default='60'))
    op.add_column('hardware_tiers', sa.Column('default_booking_minutes', sa.Integer(), nullable=True))
    op.add_column('bookings', sa.Column('players_count', sa.Integer(), nullable=True))
    op.add_column('promotions', sa.Column('play_mode', sa.String(length=10), nullable=False, server_default='any'))


def downgrade():
    op.drop_column('promotions', 'play_mode')
    op.drop_column('bookings', 'players_count')
    op.drop_column('hardware_tiers', 'default_booking_minutes')
    op.drop_column('hardware_tiers', 'min_booking_minutes')
    op.drop_column('hardware_tiers', 'coop_extra_player_price')
    op.drop_column('hardware_tiers', 'coop_max_players')
    op.drop_column('hardware_tiers', 'coop_enabled')
