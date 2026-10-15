"""cafe_waitlist: how a requester wants to be reached, and whether they know
the owner.

phone: a WhatsApp/call number, kept apart from `contact` (the free-text
signed-out handle the mailer reads for an email). contact_method: 'whatsapp'
| 'call' | 'email'. knows_owner: the requester can introduce us to the café,
which is the warmest outreach lead there is. All additive; existing rows keep
NULL / false.

Revision ID: 056
Revises: 055
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = '056'
down_revision = '055'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cafe_waitlist') as batch_op:
        batch_op.add_column(sa.Column('phone', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('contact_method', sa.String(10), nullable=True))
        batch_op.add_column(sa.Column('knows_owner', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('cafe_waitlist') as batch_op:
        batch_op.drop_column('knows_owner')
        batch_op.drop_column('contact_method')
        batch_op.drop_column('phone')
