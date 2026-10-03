"""owner_intros: players introducing us to café owners they know

Revision ID: 056
Revises: 055
Create Date: 2026-10-03

A lead café's page (and a general form) lets a signed-in player drop the
owner's name and number. Rows go to the outreach team on the admin Leads page.
Additive only.
"""
from alembic import op
import sqlalchemy as sa

revision = '056'
down_revision = '055'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'owner_intros',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('cafe_name', sa.String(160), nullable=False),
        sa.Column('area', sa.String(160), nullable=True),
        sa.Column('owner_name', sa.String(120), nullable=False),
        sa.Column('owner_phone', sa.String(20), nullable=False),
        sa.Column('relation', sa.String(20), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('owner_consent', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('submitted_by_user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='new'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_owner_intros_cafe_id', 'owner_intros', ['cafe_id'])
    op.create_index('ix_owner_intros_submitted_by_user_id', 'owner_intros', ['submitted_by_user_id'])


def downgrade():
    op.drop_index('ix_owner_intros_submitted_by_user_id', table_name='owner_intros')
    op.drop_index('ix_owner_intros_cafe_id', table_name='owner_intros')
    op.drop_table('owner_intros')
