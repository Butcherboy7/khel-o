"""auth_attempts: sign-up / login / reset requests, for rate limits and bot blocks

Revision ID: 059
Revises: 058
Create Date: 2026-10-05

Bots were creating accounts (31 in a week) and triggering password-reset
emails to real people's addresses. Each request is now logged here (email
hashed) so limits hold across workers. Additive only.
"""
from alembic import op
import sqlalchemy as sa

revision = '059'
down_revision = '058'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'auth_attempts',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('ip', sa.String(64), nullable=False),
        sa.Column('email_hash', sa.String(64), nullable=True),
        sa.Column('outcome', sa.String(10), nullable=False),
        sa.Column('reason', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_auth_attempts_ip', 'auth_attempts', ['ip'])
    op.create_index('ix_auth_attempts_email_hash', 'auth_attempts', ['email_hash'])
    op.create_index('ix_auth_attempts_created_at', 'auth_attempts', ['created_at'])


def downgrade():
    op.drop_index('ix_auth_attempts_created_at', table_name='auth_attempts')
    op.drop_index('ix_auth_attempts_email_hash', table_name='auth_attempts')
    op.drop_index('ix_auth_attempts_ip', table_name='auth_attempts')
    op.drop_table('auth_attempts')
