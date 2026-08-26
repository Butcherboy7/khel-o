"""Add app_bookable_seats_locked to hardware_tiers

Revision ID: 016
Revises: 015
Create Date: 2026-08-26

"""
from alembic import op
import sqlalchemy as sa

revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('hardware_tiers')]

    if 'app_bookable_seats_locked' not in columns:
        op.add_column(
            'hardware_tiers',
            sa.Column('app_bookable_seats_locked', sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade():
    op.drop_column('hardware_tiers', 'app_bookable_seats_locked')
