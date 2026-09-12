"""Add tier_type/activity_kind to hardware_tiers, add hardware_tier_units

Revision ID: 024
Revises: 023
Create Date: 2026-09-07

"""
from alembic import op
import sqlalchemy as sa

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'hardware_tiers',
        sa.Column('tier_type', sa.String(length=20), nullable=False, server_default='gaming'),
    )
    op.add_column(
        'hardware_tiers',
        sa.Column('activity_kind', sa.String(length=50), nullable=True),
    )
    op.create_table(
        'hardware_tier_units',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tier_id', sa.UUID(), nullable=False),
        sa.Column('label', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='available'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['tier_id'], ['hardware_tiers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_hardware_tier_units_tier_id'), 'hardware_tier_units', ['tier_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_hardware_tier_units_tier_id'), table_name='hardware_tier_units')
    op.drop_table('hardware_tier_units')
    op.drop_column('hardware_tiers', 'activity_kind')
    op.drop_column('hardware_tiers', 'tier_type')
