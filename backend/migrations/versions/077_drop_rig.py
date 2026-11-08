"""drops: which of the cafe's rigs the drop runs on

Additive. A drop with hardware_tier_id set takes daily_seats of that setup out of
normal booking during the drop's daily hours (see drop_service.dedicated_windows).

Revision ID: 077
Revises: 076
Create Date: 2026-11-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '077'
down_revision = '076'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drops', sa.Column('hardware_tier_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_drops_hardware_tier', 'drops', 'hardware_tiers', ['hardware_tier_id'], ['id'], ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_drops_hardware_tier', 'drops', type_='foreignkey')
    op.drop_column('drops', 'hardware_tier_id')
