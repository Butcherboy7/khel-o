"""drop sessions can run past midnight

A drop session may now end the next morning (18:00 to 04:00) or run all
24 hours at a 24/7 café (06:00 to 06:00). An end at or before the start
means the next day, so the "end after start" rule goes. Nothing else changes.

Revision ID: 089
Revises: 088
Create Date: 2026-11-13
"""
from alembic import op

revision = '089'
down_revision = '088'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('ck_drop_blocks_same_day', 'drop_blocks', type_='check')


def downgrade():
    op.create_check_constraint('ck_drop_blocks_same_day', 'drop_blocks', 'end_time > start_time')
