"""challenges: free in-person gaming challenges at partner cafés, and who signed up

Two new tables, so additive: nothing existing changes. Downgrade drops both.

Revision ID: 067
Revises: 066
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa


revision = '067'
down_revision = '066'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'challenges',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('slug', sa.String(length=60), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('game', sa.String(length=80), nullable=False),
        sa.Column('setup_line', sa.String(length=160), nullable=True),
        sa.Column('format', sa.String(length=120), nullable=False),
        sa.Column('best_of', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('final_best_of', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('checkin_opens_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('checkin_closes_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('capacity', sa.Integer(), nullable=False),
        sa.Column('min_age', sa.Integer(), nullable=False, server_default='18'),
        sa.Column('status', sa.String(length=12), nullable=False, server_default='draft'),
        sa.Column('rules_md', sa.Text(), nullable=False, server_default=''),
        sa.Column('prizes_md', sa.Text(), nullable=False, server_default=''),
        sa.Column('cover_image_url', sa.String(length=1000), nullable=True),
        sa.Column('community_url', sa.String(length=500), nullable=True),
        sa.Column('instagram_handle', sa.String(length=60), nullable=True),
        sa.Column('spot_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_challenges_slug', 'challenges', ['slug'], unique=True)
    op.create_index('ix_challenges_cafe_id', 'challenges', ['cafe_id'])

    op.create_table(
        'challenge_entries',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('challenge_id', sa.UUID(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('display_name', sa.String(length=40), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=False),
        sa.Column('main_character', sa.String(length=60), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=12), nullable=False),
        sa.Column('coming', sa.String(length=3), nullable=True),
        sa.Column('coming_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('promoted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('told_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('withdrawn_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('withdrawn_by', sa.String(length=10), nullable=True),
        sa.Column('present', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consent_rules', sa.Boolean(), nullable=False),
        sa.Column('consent_age', sa.Boolean(), nullable=False),
        sa.Column('consent_filming', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('consent_updates', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('utm_source', sa.String(length=80), nullable=True),
        sa.Column('utm_campaign', sa.String(length=80), nullable=True),
        sa.Column('utm_content', sa.String(length=80), nullable=True),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('challenge_id', 'user_id', name='uq_challenge_entries_user'),
        sa.UniqueConstraint('challenge_id', 'phone', name='uq_challenge_entries_phone'),
        sa.UniqueConstraint('challenge_id', 'position', name='uq_challenge_entries_position'),
    )
    op.create_index('ix_challenge_entries_challenge_id', 'challenge_entries', ['challenge_id'])
    op.create_index('ix_challenge_entries_user_id', 'challenge_entries', ['user_id'])


def downgrade():
    op.drop_table('challenge_entries')
    op.drop_table('challenges')
