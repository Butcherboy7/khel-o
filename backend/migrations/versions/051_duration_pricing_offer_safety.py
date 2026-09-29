"""15/30/60 duration pricing, offer minimum length, offer cleanup

Revision ID: 051
Revises: 050
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = '051'
down_revision = '050'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('price_15m', sa.Numeric(10, 2), nullable=True))
    op.add_column('hardware_tiers', sa.Column('price_30m', sa.Numeric(10, 2), nullable=True))
    op.add_column('promotions', sa.Column('min_booking_minutes', sa.Integer(), nullable=True))

    conn = op.get_bind()
    # Normalize shortest-booking to 15/30/60 only: 45 -> 30, anything above 60 -> 60.
    conn.execute(sa.text("UPDATE hardware_tiers SET min_booking_minutes = 30 WHERE min_booking_minutes = 45"))
    conn.execute(sa.text("UPDATE hardware_tiers SET min_booking_minutes = 60 WHERE min_booking_minutes > 60"))
    # default_booking_minutes must now be 15/30/60/90/120/... (multiples of 30 above 60);
    # anything that no longer fits that ladder (e.g. 45) is cleared back to "no override".
    conn.execute(sa.text(
        "UPDATE hardware_tiers SET default_booking_minutes = NULL "
        "WHERE default_booking_minutes IS NOT NULL "
        "AND default_booking_minutes NOT IN (15, 30) "
        "AND (default_booking_minutes < 60 OR default_booking_minutes % 30 != 0)"
    ))
    # Existing percentage/fixed_amount offers didn't carry a length rule — set to
    # 60 min so a flat discount can no longer apply to a 15/30-min booking.
    conn.execute(sa.text(
        "UPDATE promotions SET min_booking_minutes = 60 WHERE promotion_type IN ('percentage', 'fixed_amount')"
    ))


def downgrade():
    op.drop_column('promotions', 'min_booking_minutes')
    op.drop_column('hardware_tiers', 'price_30m')
    op.drop_column('hardware_tiers', 'price_15m')
