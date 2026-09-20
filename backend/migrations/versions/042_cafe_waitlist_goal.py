"""add waitlist_goal to cafes

Revision ID: 042
Revises: 041
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cafes') as batch_op:
        batch_op.add_column(sa.Column('waitlist_goal', sa.Integer(), nullable=False, server_default='30'))


def downgrade():
    with op.batch_alter_table('cafes') as batch_op:
        batch_op.drop_column('waitlist_goal')
