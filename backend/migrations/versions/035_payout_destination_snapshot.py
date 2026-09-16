"""add owner_payout_accounts.version, cafe_payouts destination snapshot columns, owner_audit_logs table

Revision ID: 035
Revises: 034
Create Date: 2026-09-16
"""
from alembic import op
import sqlalchemy as sa

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'owner_payout_accounts',
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
    )

    op.add_column('cafe_payouts', sa.Column('destination_type', sa.String(10), nullable=True))
    op.add_column('cafe_payouts', sa.Column('destination_upi_vpa', sa.String(256), nullable=True))
    op.add_column('cafe_payouts', sa.Column('destination_bank_account_masked', sa.String(20), nullable=True))
    op.add_column('cafe_payouts', sa.Column('destination_bank_ifsc', sa.String(20), nullable=True))
    op.add_column('cafe_payouts', sa.Column('destination_account_holder_name', sa.String(255), nullable=True))
    op.add_column(
        'cafe_payouts',
        sa.Column('destination_payout_account_id', sa.Uuid(), sa.ForeignKey('owner_payout_accounts.id'), nullable=True),
    )
    op.add_column('cafe_payouts', sa.Column('destination_payout_account_version', sa.Integer(), nullable=True))

    op.create_table(
        'owner_audit_logs',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('owner_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(255), nullable=False),
        sa.Column('before_summary', sa.Text(), nullable=True),
        sa.Column('after_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_owner_audit_logs_owner_id', 'owner_audit_logs', ['owner_id'])
    op.create_index('ix_owner_audit_logs_action', 'owner_audit_logs', ['action'])
    op.create_index('ix_owner_audit_logs_created_at', 'owner_audit_logs', ['created_at'])


def downgrade():
    op.drop_index('ix_owner_audit_logs_created_at', table_name='owner_audit_logs')
    op.drop_index('ix_owner_audit_logs_action', table_name='owner_audit_logs')
    op.drop_index('ix_owner_audit_logs_owner_id', table_name='owner_audit_logs')
    op.drop_table('owner_audit_logs')

    op.drop_column('cafe_payouts', 'destination_payout_account_version')
    op.drop_column('cafe_payouts', 'destination_payout_account_id')
    op.drop_column('cafe_payouts', 'destination_account_holder_name')
    op.drop_column('cafe_payouts', 'destination_bank_ifsc')
    op.drop_column('cafe_payouts', 'destination_bank_account_masked')
    op.drop_column('cafe_payouts', 'destination_upi_vpa')
    op.drop_column('cafe_payouts', 'destination_type')

    op.drop_column('owner_payout_accounts', 'version')
