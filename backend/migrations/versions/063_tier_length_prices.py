"""hardware_tiers: owner-set package prices per length + longest booking.

length_prices: {"<minutes>": price} for 1 hr 30 and longer (e.g. {"120": 280,
"180": 400}). Empty = every length is the hourly rate x length, as before.
max_booking_minutes: the longest session customers can book; NULL = 8 hours,
as before. Both default to today's behaviour, so nothing existing changes.

Revision ID: 063
Revises: 062
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = '063'
down_revision = '062'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('length_prices', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('hardware_tiers', sa.Column('max_booking_minutes', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('hardware_tiers', 'max_booking_minutes')
    op.drop_column('hardware_tiers', 'length_prices')
