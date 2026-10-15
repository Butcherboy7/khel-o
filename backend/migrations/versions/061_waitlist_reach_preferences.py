"""cafe_waitlist: how a voter wants to be reached.

phone: a WhatsApp/call number, kept apart from `contact` (the free-text
signed-out handle the mailer reads for an email). contact_method:
'whatsapp' | 'call' | 'email'. Shown to outreach on the admin Leads page.
Additive; existing rows keep NULL.

Numbered 061, not 060: 060 is the tournaments migration already applied on
the dev site (feat/tournaments). Both follow 059, so a branch carrying both
needs an alembic merge revision (`alembic merge 060 061`) before upgrading.

Revision ID: 061
Revises: 059
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

revision = '061'
down_revision = '059'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cafe_waitlist') as batch_op:
        batch_op.add_column(sa.Column('phone', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('contact_method', sa.String(10), nullable=True))


def downgrade():
    with op.batch_alter_table('cafe_waitlist') as batch_op:
        batch_op.drop_column('contact_method')
        batch_op.drop_column('phone')
