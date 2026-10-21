"""challenge day: bracket matches, check-in close, champion photo, and rewards
locked to the people who earned them

Additive only: one new table, new nullable/defaulted columns. Downgrade drops
them again.

Revision ID: 068
Revises: 067
Create Date: 2026-10-22
"""
from alembic import op
import sqlalchemy as sa


revision = '068'
down_revision = '067'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'challenge_matches',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('challenge_id', sa.UUID(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('round', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('is_third_place', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('entry_a_id', sa.UUID(), sa.ForeignKey('challenge_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entry_b_id', sa.UUID(), sa.ForeignKey('challenge_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('winner_entry_id', sa.UUID(), sa.ForeignKey('challenge_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('score_a', sa.Integer(), nullable=True),
        sa.Column('score_b', sa.Integer(), nullable=True),
        sa.Column('bye', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('challenge_id', 'round', 'position', 'is_third_place', name='uq_challenge_matches_slot'),
    )
    op.create_index('ix_challenge_matches_challenge_id', 'challenge_matches', ['challenge_id'])

    op.add_column('challenges', sa.Column('champion_photo_url', sa.String(length=1000), nullable=True))
    op.add_column('challenges', sa.Column('drawn_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('challenges', sa.Column('checkin_closed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('challenges', sa.Column('rewards_config', sa.JSON(), nullable=True))

    op.add_column('offer_campaigns', sa.Column('allowed_user_ids', sa.JSON(), nullable=True))
    op.add_column('offer_campaigns', sa.Column('max_uses_per_user', sa.Integer(), nullable=True))
    op.add_column('offer_campaigns', sa.Column('max_seats', sa.Integer(), nullable=True))
    op.add_column('offer_campaigns', sa.Column('khelo_funded', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('offer_campaigns', sa.Column(
        'challenge_id', sa.UUID(), sa.ForeignKey('challenges.id', ondelete='SET NULL'), nullable=True,
    ))
    op.add_column('offer_campaigns', sa.Column('reward_kind', sa.String(length=20), nullable=True))
    op.create_index('ix_offer_campaigns_challenge_id', 'offer_campaigns', ['challenge_id'])


def downgrade():
    op.drop_index('ix_offer_campaigns_challenge_id', table_name='offer_campaigns')
    for col in ('reward_kind', 'challenge_id', 'khelo_funded', 'max_seats', 'max_uses_per_user', 'allowed_user_ids'):
        op.drop_column('offer_campaigns', col)
    for col in ('rewards_config', 'checkin_closed_at', 'drawn_at', 'champion_photo_url'):
        op.drop_column('challenges', col)
    op.drop_table('challenge_matches')
