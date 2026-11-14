"""drop package prices and time-of-day prices

Owners can sell set lengths at set prices (1 hr 250, 3 hrs 650, 5 hrs 850)
and charge a different hourly price at some times (cheaper after midnight,
more at peak). Both are optional; empty means the plain hourly price.

Revision ID: 090
Revises: 089
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = '090'
down_revision = '089'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('length_prices', sa.JSON(), nullable=True))
    op.add_column('drops', sa.Column('time_prices', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('drops', 'time_prices')
    op.drop_column('drops', 'length_prices')
