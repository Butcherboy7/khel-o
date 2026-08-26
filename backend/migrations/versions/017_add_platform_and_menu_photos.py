"""Add platform/model to hardware_tiers and menu_photos to cafes

Revision ID: 017
Revises: 016
Create Date: 2026-08-26

"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None

PLATFORM_ENUM = sa.Enum('pc', 'playstation', 'xbox', 'nintendo', 'other', name='platformtype')


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tier_columns = [c['name'] for c in inspector.get_columns('hardware_tiers')]
    if 'platform' not in tier_columns:
        PLATFORM_ENUM.create(conn, checkfirst=True)
        op.add_column('hardware_tiers', sa.Column('platform', PLATFORM_ENUM, nullable=True))
    if 'model' not in tier_columns:
        op.add_column('hardware_tiers', sa.Column('model', sa.String(length=100), nullable=True))

    cafe_columns = [c['name'] for c in inspector.get_columns('cafes')]
    if 'menu_photos' not in cafe_columns:
        op.add_column('cafes', sa.Column('menu_photos', sa.JSON(), nullable=False, server_default='[]'))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Mirror upgrade()'s column-existence guards so downgrade() is safe to
    # run against a partially-applied migration (e.g. upgrade() failed after
    # adding some but not all columns) instead of erroring on the first
    # column that was never added.
    cafe_columns = [c['name'] for c in inspector.get_columns('cafes')]
    if 'menu_photos' in cafe_columns:
        op.drop_column('cafes', 'menu_photos')

    tier_columns = [c['name'] for c in inspector.get_columns('hardware_tiers')]
    if 'model' in tier_columns:
        op.drop_column('hardware_tiers', 'model')
    if 'platform' in tier_columns:
        op.drop_column('hardware_tiers', 'platform')

    PLATFORM_ENUM.drop(conn, checkfirst=True)
