"""add manual payout fields to owner_payout_accounts

Revision ID: 026
Revises: 025
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('owner_payout_accounts', sa.Column('upi_vpa', sa.String(256), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('bank_account_number_encrypted', sa.String(500), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('bank_name', sa.String(100), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('account_type', sa.String(20), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('payout_verification_status', sa.String(20), nullable=False, server_default='unverified'))
    op.add_column('owner_payout_accounts', sa.Column('verified_name', sa.String(255), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('verified_by_admin_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('owner_payout_accounts', sa.Column('test_transfer_ref', sa.String(100), nullable=True))


def downgrade():
    op.drop_column('owner_payout_accounts', 'test_transfer_ref')
    op.drop_column('owner_payout_accounts', 'verified_by_admin_id')
    op.drop_column('owner_payout_accounts', 'verified_at')
    op.drop_column('owner_payout_accounts', 'verified_name')
    op.drop_column('owner_payout_accounts', 'payout_verification_status')
    op.drop_column('owner_payout_accounts', 'account_type')
    op.drop_column('owner_payout_accounts', 'bank_name')
    op.drop_column('owner_payout_accounts', 'bank_account_number_encrypted')
    op.drop_column('owner_payout_accounts', 'upi_vpa')
