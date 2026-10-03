"""hardware_tiers.coop_price_30m: an owner-set price for a 30-minute co-op
session (2 players on one console). Co-op is otherwise priced as the solo
length price plus an hourly per-extra-player charge, which cannot express a
café whose 30-minute co-op price isn't half its hourly one (Rockstar PS5:
₹180 for 30 min, ₹260 for 1 hour). Nullable and additive: NULL keeps the
existing formula.

Revision ID: 055
Revises: 054
Create Date: 2026-10-03
"""
from alembic import op
import sqlalchemy as sa

revision = '055'
down_revision = '054'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('coop_price_30m', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('hardware_tiers', 'coop_price_30m')
