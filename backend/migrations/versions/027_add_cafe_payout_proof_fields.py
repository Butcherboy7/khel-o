"""add proof_image_url and admin_note to cafe_payouts

Revision ID: 027
Revises: 026
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = '027'
down_revision = '026'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cafe_payouts', sa.Column('proof_image_url', sa.String(500), nullable=True))
    op.add_column('cafe_payouts', sa.Column('admin_note', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('cafe_payouts', 'admin_note')
    op.drop_column('cafe_payouts', 'proof_image_url')
