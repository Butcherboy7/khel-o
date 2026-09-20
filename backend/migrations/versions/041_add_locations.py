"""add locations table and cafes.location_id

Revision ID: 041
Revises: 040
Create Date: 2026-09-20
"""
from alembic import op
import sqlalchemy as sa

revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'locations',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('name_norm', sa.String(100), nullable=False),
        sa.Column('state', sa.String(100), nullable=False),
        sa.Column('district', sa.String(100), nullable=True),
        sa.Column('pincode', sa.String(10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('name_norm', 'state', name='uq_locations_name_norm_state'),
    )
    op.create_index('ix_locations_name_norm', 'locations', ['name_norm'])

    with op.batch_alter_table('cafes') as batch_op:
        batch_op.add_column(sa.Column('location_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_cafes_location_id', 'locations', ['location_id'], ['id'])


def downgrade():
    with op.batch_alter_table('cafes') as batch_op:
        batch_op.drop_constraint('fk_cafes_location_id', type_='foreignkey')
        batch_op.drop_column('location_id')
    op.drop_index('ix_locations_name_norm', table_name='locations')
    op.drop_table('locations')
