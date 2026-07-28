"""002_add_indexes

Revision ID: 002_add_indexes
Revises: 001_initial_schema
Create Date: 2026-01-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = '002_add_indexes'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_index('ix_cafes_city', 'cafes', ['city'])
    op.create_index('ix_cafes_verification_status', 'cafes', ['verification_status'])
    op.create_index('ix_cafes_owner_id', 'cafes', ['owner_id'])
    op.create_index('ix_hardware_tiers_cafe_id', 'hardware_tiers', ['cafe_id'])

def downgrade() -> None:
    op.drop_index('ix_hardware_tiers_cafe_id', table_name='hardware_tiers')
    op.drop_index('ix_cafes_owner_id', table_name='cafes')
    op.drop_index('ix_cafes_verification_status', table_name='cafes')
    op.drop_index('ix_cafes_city', table_name='cafes')
