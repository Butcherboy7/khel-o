"""users.deleted_at: when the person deleted their own account.

Google Play requires apps with sign-up to offer account deletion in the app
and on the web. A deleted account is anonymised in place (see
app/services/account_deletion_service.py) rather than removed, because its
bookings and payments must stay on the café's and KHEL-O's books. is_active
alone can't tell a self-deleted account from one an admin deactivated, so
this records which it was. Additive; existing rows keep NULL.

Revision ID: 065
Revises: 064
Create Date: 2026-10-18
"""
from alembic import op
import sqlalchemy as sa

revision = '065'
down_revision = '064'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('users', 'deleted_at')
