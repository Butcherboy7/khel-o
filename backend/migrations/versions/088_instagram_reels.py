"""instagram reels shown on Explore and Community

Admin posts our Instagram reel links (with a cover image) and they show as
"KHEL-O on Instagram" on the Explore and Community pages. New table only.

Revision ID: 088
Revises: 087
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = '088'
down_revision = '087'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'instagram_reels',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('cover_url', sa.String(1000), nullable=True),
        sa.Column('title', sa.String(80), nullable=False),
        sa.Column('tag', sa.String(24), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('instagram_reels')
