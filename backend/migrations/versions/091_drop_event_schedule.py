"""drop event schedule: hours and prices per date, booking-ahead limit, closed sessions

day_hours / day_prices override the daily hours and time prices for single dates
(several stretches a day, or closed). advance_hours limits online booking to the
next N hours, from advance_from. drop_blocks.closed keeps a session the café
removed without deleting its old reservations. Owner blocks are reservations
with source "block".

Revision ID: 091
Revises: 090
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = '091'
down_revision = '090'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('day_hours', sa.JSON(), nullable=True))
    op.add_column('drops', sa.Column('day_prices', sa.JSON(), nullable=True))
    op.add_column('drops', sa.Column('advance_hours', sa.Integer(), nullable=True))
    op.add_column('drops', sa.Column('advance_from', sa.Date(), nullable=True))
    op.add_column('drop_blocks', sa.Column('closed', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('drop_blocks', 'closed')
    op.drop_column('drops', 'advance_from')
    op.drop_column('drops', 'advance_hours')
    op.drop_column('drops', 'day_prices')
    op.drop_column('drops', 'day_hours')
