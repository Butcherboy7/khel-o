"""tournaments: organisers, members, tournaments, entries, matches

Revision ID: 060
Revises: 059
Create Date: 2026-10-05

Tournament MVP (docs/superpowers/specs/2026-10-05-tournaments-mvp-design.md).
Additive only.
"""
from alembic import op
import sqlalchemy as sa

revision = '060'
down_revision = '059'
branch_labels = None
depends_on = None


def upgrade():
    now = sa.func.now()
    op.create_table(
        'organisers',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('slug', sa.String(80), nullable=False),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint('cafe_id', name='uq_organisers_cafe_id'),
    )
    op.create_index('ix_organisers_slug', 'organisers', ['slug'], unique=True)

    op.create_table(
        'organiser_members',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('organiser_id', sa.UUID(), sa.ForeignKey('organisers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(10), nullable=False, server_default='staff'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint('organiser_id', 'user_id', name='uq_organiser_member'),
    )
    op.create_index('ix_organiser_members_organiser_id', 'organiser_members', ['organiser_id'])
    op.create_index('ix_organiser_members_user_id', 'organiser_members', ['user_id'])

    op.create_table(
        'tournaments',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('organiser_id', sa.UUID(), sa.ForeignKey('organisers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('cafe_id', sa.UUID(), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('hardware_tier_id', sa.UUID(), sa.ForeignKey('hardware_tiers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('slug', sa.String(120), nullable=False),
        sa.Column('title', sa.String(120), nullable=False),
        sa.Column('game_key', sa.String(30), nullable=False),
        sa.Column('game_name', sa.String(60), nullable=False),
        sa.Column('team_size', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('format', sa.String(20), nullable=False, server_default='single_elim'),
        sa.Column('third_place', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('max_teams', sa.Integer(), nullable=False),
        sa.Column('entry_fee', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('check_in_minutes', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('registration_closes_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('match_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('stations', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('prizes', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('sponsor_name', sa.String(80), nullable=True),
        sa.Column('sponsor_logo_url', sa.String(500), nullable=True),
        sa.Column('about', sa.Text(), nullable=True),
        sa.Column('rules', sa.Text(), nullable=True),
        sa.Column('status', sa.String(12), nullable=False, server_default='draft'),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=now),
    )
    op.create_index('ix_tournaments_slug', 'tournaments', ['slug'], unique=True)
    for col in ('organiser_id', 'cafe_id', 'hardware_tier_id', 'starts_at', 'status'):
        op.create_index(f'ix_tournaments_{col}', 'tournaments', [col])

    op.create_table(
        'tournament_entries',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('tournament_id', sa.UUID(), sa.ForeignKey('tournaments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('gamer_tag', sa.String(40), nullable=False),
        sa.Column('team_name', sa.String(60), nullable=True),
        sa.Column('teammates', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('status', sa.String(10), nullable=False),
        sa.Column('source', sa.String(10), nullable=False, server_default='online'),
        sa.Column('check_in_code', sa.String(8), nullable=False),
        sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('seed', sa.Integer(), nullable=True),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('razorpay_order_id', sa.String(80), nullable=True),
        sa.Column('razorpay_payment_id', sa.String(80), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('hold_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refund_due', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('final_place', sa.Integer(), nullable=True),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=now),
        sa.UniqueConstraint('razorpay_order_id', name='uq_tournament_entries_order'),
    )
    for col in ('tournament_id', 'user_id', 'status', 'check_in_code'):
        op.create_index(f'ix_tournament_entries_{col}', 'tournament_entries', [col])

    op.create_table(
        'tournament_matches',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('tournament_id', sa.UUID(), sa.ForeignKey('tournaments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('round', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('is_third_place', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('entry_a_id', sa.UUID(), sa.ForeignKey('tournament_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('entry_b_id', sa.UUID(), sa.ForeignKey('tournament_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('score_a', sa.Integer(), nullable=True),
        sa.Column('score_b', sa.Integer(), nullable=True),
        sa.Column('winner_entry_id', sa.UUID(), sa.ForeignKey('tournament_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='waiting'),
        sa.Column('walkover', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('station', sa.Integer(), nullable=True),
        sa.Column('called_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_tournament_matches_tournament_id', 'tournament_matches', ['tournament_id'])


def downgrade():
    op.drop_table('tournament_matches')
    op.drop_table('tournament_entries')
    op.drop_table('tournaments')
    op.drop_table('organiser_members')
    op.drop_table('organisers')
