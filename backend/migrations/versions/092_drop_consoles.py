"""drop consoles: which consoles a drop uses, and which console each booking sits on

drops.consoles lists the consoles of the drop as "<setup id>:<number>" (PS5 Pro 1,
PS5 Pro 2, Xbox 1...), any mix of the café's setups. Null = the old way: the first
daily_seats consoles of hardware_tier_id. drop_reservations.units is the console(s)
a booking holds; units_pinned = the café picked them, so they never move. Online
bookings can be moved to another console of the same setup to make room.

Revision ID: 092
Revises: 091
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = '092'
down_revision = '091'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('consoles', sa.JSON(), nullable=True))
    op.add_column('drop_reservations', sa.Column('units', sa.JSON(), nullable=True))
    op.add_column('drop_reservations', sa.Column('units_pinned', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('drop_blocks', sa.Column('rev', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('drop_blocks', 'rev')
    op.drop_column('drop_reservations', 'units_pinned')
    op.drop_column('drop_reservations', 'units')
    op.drop_column('drops', 'consoles')
