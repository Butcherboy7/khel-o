"""Team challenges: paid team and solo entry, players, payments, match times

A team challenge (Valorant 3v3 at XQZ first) keeps the Tekken building blocks:
a team is one challenge_entries row (it is what the bracket pairs up), its
people live in challenge_players, and every Razorpay order for an entry lives
in challenge_payments. Matches gain a start time, a lobby and per-game scores.

Revision ID: 098
Revises: 097
Create Date: 2026-11-23
"""
import sqlalchemy as sa
from alembic import op

revision = '098'
down_revision = '097r'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('challenge_entries', sa.Column('kind', sa.String(12), nullable=True))
    op.add_column('challenge_entries', sa.Column('invite_code', sa.String(12), nullable=True))
    op.add_column('challenge_entries', sa.Column('offered_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_challenge_entries_invite_code', 'challenge_entries', ['invite_code'], unique=True)

    op.add_column('challenge_matches', sa.Column('starts_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('challenge_matches', sa.Column('lobby', sa.String(4), nullable=True))
    op.add_column('challenge_matches', sa.Column('games', sa.JSON(), nullable=True))

    op.create_table(
        'challenge_players',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('challenge_id', sa.Uuid(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entry_id', sa.Uuid(), sa.ForeignKey('challenge_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, server_default='active'),
        sa.Column('full_name', sa.String(60), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('riot_id', sa.String(30), nullable=False),
        sa.Column('riot_key', sa.String(30), nullable=False),
        sa.Column('rank', sa.String(20), nullable=True),
        sa.Column('instagram', sa.String(30), nullable=True),
        sa.Column('college', sa.String(80), nullable=True),
        sa.Column('play_style', sa.String(20), nullable=True),
        sa.Column('tapped_community_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tapped_insta_khelo_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tapped_insta_venue_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('agreed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('added_by', sa.String(10), nullable=True),
        sa.Column('is_test', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('challenge_id', 'user_id', name='uq_challenge_players_user'),
        sa.UniqueConstraint('challenge_id', 'riot_key', name='uq_challenge_players_riot'),
    )
    op.create_index('ix_challenge_players_challenge_id', 'challenge_players', ['challenge_id'])
    op.create_index('ix_challenge_players_entry_id', 'challenge_players', ['entry_id'])

    op.create_table(
        'challenge_payments',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('challenge_id', sa.Uuid(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('kind', sa.String(8), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('status', sa.String(10), nullable=False, server_default='created'),
        sa.Column('razorpay_order_id', sa.String(60), nullable=False, unique=True),
        sa.Column('razorpay_payment_id', sa.String(60), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('form', sa.JSON(), nullable=False),
        sa.Column('entry_id', sa.Uuid(), sa.ForeignKey('challenge_entries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('player_id', sa.Uuid(), sa.ForeignKey('challenge_players.id', ondelete='SET NULL'), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refund_id', sa.String(60), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('refund_reason', sa.String(120), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_challenge_payments_challenge_id', 'challenge_payments', ['challenge_id'])
    op.create_index('ix_challenge_payments_user_id', 'challenge_payments', ['user_id'])


def downgrade():
    op.drop_table('challenge_payments')
    op.drop_table('challenge_players')
    op.drop_column('challenge_matches', 'games')
    op.drop_column('challenge_matches', 'lobby')
    op.drop_column('challenge_matches', 'starts_at')
    op.drop_index('ix_challenge_entries_invite_code', table_name='challenge_entries')
    op.drop_column('challenge_entries', 'offered_at')
    op.drop_column('challenge_entries', 'invite_code')
    op.drop_column('challenge_entries', 'kind')
