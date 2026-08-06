"""add seat allocation fields

Revision ID: 007_add_seat_allocation_fields
Revises: 006_khelo_v2_schema
Create Date: 2026-08-06 09:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '007_add_seat_allocation_fields'
down_revision: Union[str, None] = '006_khelo_v2_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add app_bookable_seats and reserved_walkin_seats to cafes
    op.add_column('cafes', sa.Column('app_bookable_seats', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('cafes', sa.Column('reserved_walkin_seats', sa.Integer(), nullable=False, server_default='0'))
    
    # Add reserved_walkin_seats to hardware_tiers
    op.add_column('hardware_tiers', sa.Column('reserved_walkin_seats', sa.Integer(), nullable=False, server_default='0'))

def downgrade() -> None:
    op.drop_column('cafes', 'app_bookable_seats')
    op.drop_column('cafes', 'reserved_walkin_seats')
    op.drop_column('hardware_tiers', 'reserved_walkin_seats')
