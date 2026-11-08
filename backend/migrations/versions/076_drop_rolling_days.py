"""drops: rolling daily schedule (first week, extends itself up to 2 weeks)

Additive. A drop with daily_start_time set gets its day blocks made on demand
(see drop_service.ensure_blocks); drops with hand-made blocks are untouched.

Revision ID: 076
Revises: 075
Create Date: 2026-11-08
"""
from alembic import op
import sqlalchemy as sa

revision = '076'
down_revision = '075'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('daily_start_time', sa.Time(), nullable=True))
    op.add_column('drops', sa.Column('daily_end_time', sa.Time(), nullable=True))
    op.add_column('drops', sa.Column('daily_seats', sa.Integer(), nullable=True))
    op.add_column('drops', sa.Column('starts_on', sa.Date(), nullable=True))
    op.add_column('drops', sa.Column('ends_on', sa.Date(), nullable=True))
    op.create_unique_constraint('uq_drop_blocks_day', 'drop_blocks', ['drop_id', 'session_date', 'start_time'])


def downgrade():
    op.drop_constraint('uq_drop_blocks_day', 'drop_blocks', type_='unique')
    for c in ('ends_on', 'starts_on', 'daily_seats', 'daily_end_time', 'daily_start_time'):
        op.drop_column('drops', c)
