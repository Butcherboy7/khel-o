"""challenge_matches.postponed_at: a match put off because a player is late

Additive only: one nullable timestamp. A postponed match drops to the back of
the "ready to play" queue so the next match can start; nothing else about the
bracket changes. NULL for every existing match, which changes nothing.
Downgrade drops the column (never run without approval).

Revision ID: 072
Revises: 071
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa


revision = '072'
down_revision = '071'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('challenge_matches', sa.Column('postponed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('challenge_matches', 'postponed_at')
