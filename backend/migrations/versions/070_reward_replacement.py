"""challenge rewards: which reward a replacement replaced, and a financial-review note

Additive only: two nullable columns on offer_campaigns. A reward made to
replace one that was already redeemed (after a corrected result) points at the
old reward and carries a note, so Admin -> Payouts can flag it for review.
Downgrade drops them again (never run without approval).

Revision ID: 070
Revises: 069
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa


revision = '070'
down_revision = '069'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('offer_campaigns', sa.Column('replaces_campaign_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_offer_campaigns_replaces', 'offer_campaigns', 'offer_campaigns',
        ['replaces_campaign_id'], ['id'], ondelete='SET NULL',
    )
    op.add_column('offer_campaigns', sa.Column('financial_review_note', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('offer_campaigns', 'financial_review_note')
    op.drop_constraint('fk_offer_campaigns_replaces', 'offer_campaigns', type_='foreignkey')
    op.drop_column('offer_campaigns', 'replaces_campaign_id')
