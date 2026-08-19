"""Add Razorpay Route transfer tracking to platform_fees

Revision ID: 015
Revises: 014
Create Date: 2026-08-19

"""
from alembic import op
import sqlalchemy as sa

revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('platform_fees')]

    if 'razorpay_transfer_id' not in columns:
        op.add_column('platform_fees', sa.Column('razorpay_transfer_id', sa.String(length=100), nullable=True))
    if 'transfer_status' not in columns:
        op.add_column('platform_fees', sa.Column('transfer_status', sa.String(length=30), nullable=False, server_default='pending'))
    if 'transfer_error' not in columns:
        op.add_column('platform_fees', sa.Column('transfer_error', sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column('platform_fees', 'transfer_error')
    op.drop_column('platform_fees', 'transfer_status')
    op.drop_column('platform_fees', 'razorpay_transfer_id')
