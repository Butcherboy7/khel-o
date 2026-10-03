"""marketing_campaigns: campaigns the team creates, each with a short link

Revision ID: 057
Revises: 056
Create Date: 2026-10-04

The admin Campaigns page used to list every UTM tag ever seen in visits.
Now only campaigns created here show; old tags stay in Traffic. Additive only.
"""
from alembic import op
import sqlalchemy as sa

revision = '057'
down_revision = '056'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'marketing_campaigns',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('slug', sa.String(40), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('channel', sa.String(30), nullable=False),
        sa.Column('paid', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('landing_path', sa.String(300), nullable=False, server_default='/'),
        sa.Column('utm_source', sa.String(40), nullable=False),
        sa.Column('utm_medium', sa.String(40), nullable=False),
        sa.Column('spend_inr', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(12), nullable=False, server_default='live'),
        sa.Column('started_on', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_marketing_campaigns_slug', 'marketing_campaigns', ['slug'], unique=True)


def downgrade():
    op.drop_index('ix_marketing_campaigns_slug', table_name='marketing_campaigns')
    op.drop_table('marketing_campaigns')
