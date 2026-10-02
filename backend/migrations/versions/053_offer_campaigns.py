"""offer campaigns: link-only offer bundles with a shared spot cap (additive)

Revision ID: 053
Revises: 052
Create Date: 2026-10-02

Purely additive: a new table plus one nullable column. Existing promotions get
campaign_id NULL and behave exactly as before.
"""
from alembic import op
import sqlalchemy as sa

revision = '053'
down_revision = '052'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'offer_campaigns',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('access_code', sa.String(20), nullable=False),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_offer_campaigns_cafe_id', 'offer_campaigns', ['cafe_id'])
    op.create_index('ix_offer_campaigns_access_code', 'offer_campaigns', ['access_code'], unique=True)

    op.add_column('promotions', sa.Column('campaign_id', sa.UUID(), sa.ForeignKey('offer_campaigns.id'), nullable=True))
    op.create_index('ix_promotions_campaign_id', 'promotions', ['campaign_id'])


def downgrade():
    op.drop_index('ix_promotions_campaign_id', table_name='promotions')
    op.drop_column('promotions', 'campaign_id')
    op.drop_index('ix_offer_campaigns_access_code', table_name='offer_campaigns')
    op.drop_index('ix_offer_campaigns_cafe_id', table_name='offer_campaigns')
    op.drop_table('offer_campaigns')
