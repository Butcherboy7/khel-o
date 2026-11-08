"""community hub: weekly poll, members, contributions

New tables only, so additive. Seeds one active poll so the page works on a
fresh database; an admin replaces it with PUT /admin/community/poll.

Revision ID: 074
Revises: 073
Create Date: 2026-11-08
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '074'
down_revision = '073'
branch_labels = None
depends_on = None


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade():
    polls = op.create_table(
        'community_polls',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('question', sa.String(160), nullable=False),
        sa.Column('options', JSONB(), nullable=False),
        sa.Column('closes_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('members_code', sa.String(40), nullable=True),
        sa.Column('members_code_note', sa.String(160), nullable=True),
        sa.Column('status', sa.String(10), nullable=False, server_default='active'),
        _ts('created_at'),
    )
    op.create_table(
        'community_poll_votes',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('poll_id', sa.UUID(), sa.ForeignKey('community_polls.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('option_index', sa.Integer(), nullable=False),
        _ts('created_at'),
        sa.UniqueConstraint('poll_id', 'user_id', name='uq_poll_vote_user'),
    )
    op.create_table(
        'community_members',
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        _ts('joined_at'),
    )
    op.create_table(
        'community_contributions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('title', sa.String(120), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('show_name', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('status', sa.String(10), nullable=False, server_default='new'),
        _ts('created_at'),
    )
    op.bulk_insert(polls, [{
        'id': uuid.uuid4(),
        'question': 'Which game for Challenge #02?',
        'options': ['Tekken 8', 'Street Fighter 6', 'EA FC 26'],
        'members_code': None,
        'members_code_note': 'Shared here first for the next drop',
        'status': 'active',
    }])


def downgrade():
    op.drop_table('community_contributions')
    op.drop_table('community_members')
    op.drop_table('community_poll_votes')
    op.drop_table('community_polls')
