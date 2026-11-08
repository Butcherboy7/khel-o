"""drops: flexible hours (1-5h), long-stay fee, give-away

Additive, nullable columns only: old whole-session reservations keep working.

Revision ID: 075
Revises: 074
Create Date: 2026-11-08
"""
from alembic import op
import sqlalchemy as sa

revision = '075'
down_revision = '074'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('max_hours', sa.Integer(), nullable=True))
    op.add_column('drops', sa.Column('deposit_amount_long', sa.Numeric(10, 2), nullable=True))
    op.add_column('drop_reservations', sa.Column('start_time', sa.Time(), nullable=True))
    op.add_column('drop_reservations', sa.Column('end_time', sa.Time(), nullable=True))
    op.add_column('drop_reservations', sa.Column('hours', sa.Integer(), nullable=True))
    op.add_column('drop_reservations', sa.Column('given_away_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for c in ('given_away_at', 'hours', 'end_time', 'start_time'):
        op.drop_column('drop_reservations', c)
    op.drop_column('drops', 'deposit_amount_long')
    op.drop_column('drops', 'max_hours')
