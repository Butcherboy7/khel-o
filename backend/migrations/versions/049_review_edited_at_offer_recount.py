"""reviews.edited_at; recount offer redemptions from paid bookings only

Revision ID: 049
Revises: 048
Create Date: 2026-09-27

promotions.current_uses used to go up when a booking was created (still
pending payment), so abandoned and failed checkouts counted as redeemed.
It now counts only paid bookings; this brings existing rows in line.
"""
from alembic import op
import sqlalchemy as sa

revision = '049'
down_revision = '048'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('reviews', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
    op.execute("""
        UPDATE promotions SET current_uses = (
            SELECT COUNT(*) FROM bookings
            WHERE bookings.promotion_id = promotions.id
              AND CAST(bookings.status AS VARCHAR) IN ('confirmed', 'checked_in', 'active', 'completed', 'no_show')
        )
    """)


def downgrade():
    op.drop_column('reviews', 'edited_at')
