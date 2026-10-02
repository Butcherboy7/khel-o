"""public multi-café campaigns + collectible user badges (additive)

Revision ID: 054
Revises: 053
Create Date: 2026-10-02

- offer_campaigns.cafe_id becomes nullable (a campaign may span cafés; every
  promotion in it still carries its own cafe_id) and gains is_public: when true
  the campaign's promotions are ordinary public offers (listed and auto-applied
  everywhere); the campaign is only the presentation / badge / tracking layer.
- user_badges: one row per (user, badge) so a campaign badge is kept for good.
Existing rows keep their behaviour (is_public defaults to false).
"""
from alembic import op
import sqlalchemy as sa

revision = '054'
down_revision = '053'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('offer_campaigns', 'cafe_id', existing_type=sa.UUID(), nullable=True)
    op.add_column('offer_campaigns', sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'user_badges',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('badge_key', sa.String(50), nullable=False),
        sa.Column('campaign_id', sa.UUID(), sa.ForeignKey('offer_campaigns.id'), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'badge_key', name='uq_user_badges_user_key'),
    )
    op.create_index('ix_user_badges_user_id', 'user_badges', ['user_id'])


def downgrade():
    op.drop_index('ix_user_badges_user_id', table_name='user_badges')
    op.drop_table('user_badges')
    op.drop_column('offer_campaigns', 'is_public')
    op.alter_column('offer_campaigns', 'cafe_id', existing_type=sa.UUID(), nullable=False)
