"""khelo_v2_schema

Revision ID: 006_khelo_v2_schema
Revises: 005_add_rejection_reason
Create Date: 2026-07-30 14:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '006_khelo_v2_schema'
down_revision: Union[str, None] = '005_add_rejection_reason'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create owner_payout_accounts table
    op.create_table(
        'owner_payout_accounts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=False),
        sa.Column('razorpay_account_id', sa.String(length=100), nullable=True),
        sa.Column('kyc_status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('business_pan', sa.String(length=20), nullable=True),
        sa.Column('bank_account_number_masked', sa.String(length=20), nullable=True),
        sa.Column('bank_ifsc', sa.String(length=20), nullable=True),
        sa.Column('account_holder_name', sa.String(length=255), nullable=True),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('razorpay_account_id')
    )
    op.create_index('ix_owner_payout_accounts_owner_id', 'owner_payout_accounts', ['owner_id'], unique=True)

    # 2. Modify hardware_tiers table
    op.alter_column('hardware_tiers', 'seats_in_tier', new_column_name='total_seats')
    op.add_column('hardware_tiers', sa.Column('app_bookable_seats', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('hardware_tiers', sa.Column('active_seats_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('hardware_tiers', sa.Column('preset_category', sa.String(length=50), nullable=True))
    
    # Backfill app_bookable_seats and active_seats_count from total_seats
    op.execute("UPDATE hardware_tiers SET app_bookable_seats = total_seats, active_seats_count = total_seats")

    # 3. Create checkin_method enum type and modify bookings table
    checkin_method_enum = sa.Enum('qr_scan', 'manual', name='checkinmethod')
    checkin_method_enum.create(op.get_bind())
    
    op.add_column('bookings', sa.Column('actual_start_time', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('actual_end_time', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bookings', sa.Column('checkin_method', sa.Enum('qr_scan', 'manual', name='checkinmethod'), nullable=True))
    op.add_column('bookings', sa.Column('convenience_fee', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'))

    # 4. Create platform_fees table
    op.create_table(
        'platform_fees',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('booking_id', sa.UUID(), nullable=False),
        sa.Column('convenience_fee', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('gateway_fee', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('tds_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('owner_settlement_amount', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ondelete='CASCADE')
    )
    op.create_index('ix_platform_fees_booking_id', 'platform_fees', ['booking_id'], unique=True)

    # 5. Modify cafes table for booking caps
    op.add_column('cafes', sa.Column('booking_cap_total', sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00'))
    op.add_column('cafes', sa.Column('booking_cap_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    # 5. Revert cafes table changes
    op.drop_column('cafes', 'booking_cap_count')
    op.drop_column('cafes', 'booking_cap_total')

    # 4. Drop platform_fees table
    op.drop_table('platform_fees')

    # 3. Revert bookings table changes
    op.drop_column('bookings', 'convenience_fee')
    op.drop_column('bookings', 'checkin_method')
    op.drop_column('bookings', 'actual_end_time')
    op.drop_column('bookings', 'actual_start_time')
    
    checkin_method_enum = sa.Enum('qr_scan', 'manual', name='checkinmethod')
    checkin_method_enum.drop(op.get_bind())

    # 2. Revert hardware_tiers table changes
    op.drop_column('hardware_tiers', 'preset_category')
    op.drop_column('hardware_tiers', 'active_seats_count')
    op.drop_column('hardware_tiers', 'app_bookable_seats')
    op.alter_column('hardware_tiers', 'total_seats', new_column_name='seats_in_tier')

    # 1. Drop owner_payout_accounts table
    op.drop_table('owner_payout_accounts')
