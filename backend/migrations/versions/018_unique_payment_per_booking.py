"""Enforce one payment row per booking (P0-A1: duplicate payments)

payments.booking_id had no uniqueness guarantee, so the check-then-insert in
PaymentService.create_razorpay_order could race and charge one booking twice.
A UNIQUE index makes the database itself the last line of defence.

Revision ID: 018
Revises: 017
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa

revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None

INDEX_NAME = 'uq_payments_booking_id'


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing = {ix['name'] for ix in inspector.get_indexes('payments')}
    existing |= {uc['name'] for uc in inspector.get_unique_constraints('payments')}
    if INDEX_NAME in existing:
        return

    # Never silently drop payment rows — money data. If duplicates already exist
    # they must be reconciled (refund/void the extra charge) by hand first.
    duplicates = conn.execute(sa.text(
        "SELECT booking_id, COUNT(*) AS n FROM payments "
        "GROUP BY booking_id HAVING COUNT(*) > 1"
    )).fetchall()
    if duplicates:
        detail = ", ".join(f"{row[0]} ({row[1]} payments)" for row in duplicates)
        raise RuntimeError(
            "Cannot add UNIQUE(payments.booking_id): duplicate payments already "
            f"exist for these bookings: {detail}. Reconcile them manually "
            "(refund/void the extra charges, delete the surplus rows) and re-run."
        )

    op.create_index(INDEX_NAME, 'payments', ['booking_id'], unique=True)


def downgrade():
    op.drop_index(INDEX_NAME, table_name='payments')
