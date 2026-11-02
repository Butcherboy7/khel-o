"""reviews.booking_id: allow reviews with no booking behind them

A review left without a KHEL-O booking (walk-ins, the Tekken #01 rate link)
stores a placeholder id in booking_id, which the foreign key to bookings
rejected, so every such review failed with an unexpected error. The foreign
key is dropped; the column stays NOT NULL and UNIQUE. Real booking reviews are
untouched. Downgrade puts the constraint back (it fails if walk-in reviews
exist, so never run it without approval).

Revision ID: 073r
Revises: 072
Create Date: 2026-11-02
"""
from alembic import op


revision = '073r'
down_revision = '072'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_booking_id_fkey")


def downgrade():
    op.create_foreign_key('reviews_booking_id_fkey', 'reviews', 'bookings', ['booking_id'], ['id'])
