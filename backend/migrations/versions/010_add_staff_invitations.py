"""Add staff_invitations table

Revision ID: 010
Revises: 009
Create Date: 2026-08-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'staff_invitations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('venue_id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('phone_number', sa.String(length=20), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='staff'),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('invited_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['venue_id'], ['cafes.id'], ),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_staff_invitations_email'), 'staff_invitations', ['email'], unique=False)
    op.create_index(op.f('ix_staff_invitations_token'), 'staff_invitations', ['token'], unique=True)
    op.create_index(op.f('ix_staff_invitations_venue_id'), 'staff_invitations', ['venue_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_staff_invitations_venue_id'), table_name='staff_invitations')
    op.drop_index(op.f('ix_staff_invitations_token'), table_name='staff_invitations')
    op.drop_index(op.f('ix_staff_invitations_email'), table_name='staff_invitations')
    op.drop_table('staff_invitations')
