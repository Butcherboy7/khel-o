"""Add booking control fields

Revision ID: 008
Revises: 007_add_seat_allocation_fields
Create Date: 2026-08-07

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007_add_seat_allocation_fields'
branch_labels = None
depends_on = None


def upgrade():
    # Add bookable_stations column (actual inventory for booking engine)
    op.add_column('cafes', sa.Column('bookable_stations', sa.Integer(), nullable=True))
    
    # Add bookings_paused column (pause toggle for online bookings)
    op.add_column('cafes', sa.Column('bookings_paused', sa.Boolean(), nullable=True))
    
    # BACKFILL: Set bookable_stations from sum of tier-level app_bookable_seats for existing cafes
    # This ensures existing cafés maintain their booking availability
    op.execute("""
        UPDATE cafes 
        SET bookable_stations = (
            SELECT COALESCE(SUM(app_bookable_seats), 0)
            FROM hardware_tiers
            WHERE hardware_tiers.cafe_id = cafes.id
        ),
        bookings_paused = 0
        WHERE bookable_stations IS NULL
    """)
    
    # Now make columns NOT NULL with defaults for new inserts
    op.alter_column('cafes', 'bookable_stations', 
                    existing_type=sa.Integer(),
                    nullable=False,
                    server_default='0')
    op.alter_column('cafes', 'bookings_paused',
                    existing_type=sa.Boolean(),
                    nullable=False,
                    server_default='0')


def downgrade():
    op.drop_column('cafes', 'bookings_paused')
    op.drop_column('cafes', 'bookable_stations')
