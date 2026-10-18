"""photo colours: the main colour of each café photo, keyed by URL

Shown behind a photo while it loads (app/services/photo_colors.py). A new
table, so additive: nothing existing changes.

Revision ID: 066
Revises: 065
Create Date: 2026-10-19
"""
from alembic import op
import sqlalchemy as sa


revision = '066'
down_revision = '065'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'photo_colors',
        sa.Column('url', sa.String(length=1000), primary_key=True),
        sa.Column('color', sa.String(length=7), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('photo_colors')
