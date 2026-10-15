"""launch_signups: game-launch lists (GTA 6 first).

A public "message me when launch slots open" list: name, phone, how they want
to be reached (whatsapp | text | call), optional email, the consent tick, and
the utm tags of the link they came from. One row per phone per launch.
New table only; nothing existing changes.

Revision ID: 062
Revises: 061
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = '062'
down_revision = '061'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'launch_signups',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('launch', sa.String(20), nullable=False),
        sa.Column('name', sa.String(80), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('contact_method', sa.String(10), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('consent', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('utm_source', sa.String(80), nullable=True),
        sa.Column('utm_campaign', sa.String(80), nullable=True),
        sa.Column('utm_content', sa.String(80), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('launch', 'phone', name='uq_launch_signups_launch_phone'),
    )
    op.create_index('ix_launch_signups_launch', 'launch_signups', ['launch'])


def downgrade():
    op.drop_index('ix_launch_signups_launch', table_name='launch_signups')
    op.drop_table('launch_signups')
