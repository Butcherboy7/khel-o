"""users.sessions_valid_from: a cutoff for logins issued before an account was claimed

Additive only: one nullable timestamp on users. A player who signs up to a
challenge with just a name, number and email gets an account with no password
and no Google link. If the real owner of that email later claims it (signs in
with Google, or sets a password through the reset link), any login issued
before that moment must stop working, so typing someone else's email never
leaves a lasting way into their account. NULL for every existing user, which
changes nothing for them.
Downgrade drops the column (never run without approval).

Revision ID: 071
Revises: 070
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa


revision = '071'
down_revision = '070'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('sessions_valid_from', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('users', 'sessions_valid_from')
