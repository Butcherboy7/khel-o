"""bookings: KHEL-O-paid ₹1 price drop + first-booking offer flag.

khelo_discount: what KHEL-O knocks off the customer's price and pays the café
itself (₹150 -> ₹149 on round prices). The café's share is unchanged.
first_booking_offer: this booking had its booking fee waived as the
customer's first booking (launch offer, capped). Defaults keep every existing
booking exactly as it was.

Revision ID: 064
Revises: 063
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa

revision = '064'
down_revision = '063'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('bookings', sa.Column('khelo_discount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.add_column('bookings', sa.Column('first_booking_offer', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('bookings', 'first_booking_offer')
    op.drop_column('bookings', 'khelo_discount')
