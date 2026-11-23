"""Team challenge emails: remember what was sent to whom, so each goes out once

Revision ID: 099
Revises: 098
Create Date: 2026-11-23
"""
import sqlalchemy as sa
from alembic import op

revision = '099'
down_revision = '098'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'challenge_mails',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('challenge_id', sa.Uuid(), sa.ForeignKey('challenges.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.Uuid(), sa.ForeignKey('challenge_players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(60), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('player_id', 'kind', name='uq_challenge_mails_player_kind'),
    )
    op.create_index('ix_challenge_mails_challenge_id', 'challenge_mails', ['challenge_id'])
    op.create_index('ix_challenge_mails_player_id', 'challenge_mails', ['player_id'])


def downgrade():
    op.drop_table('challenge_mails')
