"""Per-setup price and name on a drop (XQZ: PS5 Sofa recliner at 300, PS5 Bean bags at 200)

Revision ID: 097
Revises: 096
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op

revision = '097'
down_revision = '096'
branch_labels = None
depends_on = None


def upgrade():
    # {"<hardware tier id>": {"price": 300, "label": "Sofa"}}. Empty for every existing drop, so nothing changes for them.
    op.add_column('drops', sa.Column('setup_options', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('drops', 'setup_options')
