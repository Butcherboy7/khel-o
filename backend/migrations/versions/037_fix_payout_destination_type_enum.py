"""fix cafe_payouts.destination_type: create missing payoutdestinationtype
enum and convert the column to it (035 added the column as plain VARCHAR,
but the CafePayout model declares it as a native Postgres Enum — every
mark-as-paid insert with a destination_type has been raising
UndefinedObjectError in production since 035 shipped).

Revision ID: 037
Revises: 036
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None

destination_type_enum = sa.Enum('upi', 'bank', name='payoutdestinationtype')


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        # SQLite (local dev/tests) has no native enum type — SQLAlchemy's
        # Enum() there is just a VARCHAR with a CHECK constraint, which 035
        # already produced. Nothing to fix outside Postgres.
        return
    destination_type_enum.create(bind, checkfirst=True)
    op.execute(
        "ALTER TABLE cafe_payouts "
        "ALTER COLUMN destination_type TYPE payoutdestinationtype "
        "USING destination_type::payoutdestinationtype"
    )


def downgrade():
    bind = op.get_bind()
    if bind.dialect.name != 'postgresql':
        return
    op.execute("ALTER TABLE cafe_payouts ALTER COLUMN destination_type TYPE VARCHAR(10)")
    destination_type_enum.drop(bind, checkfirst=True)
