"""marketing_campaigns.extra_tags: other UTM tags that count as this campaign

Revision ID: 058
Revises: 057
Create Date: 2026-10-05

A boosted reel's ad can reach people with Meta's own tags
(utm_source=ig, utm_campaign=<ad id>) instead of the short link's. Listing
those tags on the campaign folds them into its numbers. Additive only.
"""
from alembic import op
import sqlalchemy as sa

revision = '058'
down_revision = '057'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'marketing_campaigns',
        sa.Column('extra_tags', sa.JSON(), nullable=False, server_default='[]'),
    )


def downgrade():
    op.drop_column('marketing_campaigns', 'extra_tags')
