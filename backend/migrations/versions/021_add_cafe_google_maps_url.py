"""add google_maps_url to cafes

Revision ID: 021
Revises: 020
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa

revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cafes', sa.Column('google_maps_url', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('cafes', 'google_maps_url')
