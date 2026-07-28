"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-01-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('google_id', sa.String(length=255), nullable=True),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('phone_number', sa.String(length=20), nullable=True),
        sa.Column('role', sa.Enum('gamer', 'cafe_owner', 'admin', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_google_id', 'users', ['google_id'])

    # Cafes table
    op.create_table(
        'cafes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('address_line1', sa.String(length=255), nullable=False),
        sa.Column('address_line2', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('state', sa.String(length=100), nullable=False),
        sa.Column('pincode', sa.String(length=10), nullable=False),
        sa.Column('latitude', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('longitude', sa.Numeric(precision=10, scale=7), nullable=True),
        sa.Column('phone_number', sa.String(length=20), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('opening_time', sa.Time(), nullable=True),
        sa.Column('closing_time', sa.Time(), nullable=True),
        sa.Column('verification_status', sa.Enum('pending', 'verified', 'rejected', 'suspended', name='verificationstatus'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('total_seats', sa.Integer(), nullable=True),
        sa.Column('amenities', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('photos', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Hardware Tiers table
    op.create_table(
        'hardware_tiers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('cafe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('specs', postgresql.JSONB(), server_default='{}', nullable=False),
        sa.Column('seats_in_tier', sa.Integer(), server_default='0', nullable=False),
        sa.Column('price_per_hour', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Promotions table
    op.create_table(
        'promotions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('cafe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('discount_percentage', sa.Integer(), nullable=False),
        sa.Column('applicable_tier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hardware_tiers.id'), nullable=True),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('days_of_week', postgresql.JSONB(), server_default='[]', nullable=False),
        sa.Column('start_hour', sa.Integer(), nullable=False),
        sa.Column('end_hour', sa.Integer(), nullable=False),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('current_uses', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Bookings table
    op.create_table(
        'bookings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('booking_reference', sa.String(length=20), nullable=False, unique=True),
        sa.Column('gamer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('cafe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('hardware_tier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('hardware_tiers.id'), nullable=False),
        sa.Column('session_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('duration_hours', sa.Numeric(precision=4, scale=2), nullable=False),
        sa.Column('base_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=False),
        sa.Column('gateway_fee', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('status', sa.Enum('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show', name='bookingstatus'), nullable=False),
        sa.Column('promotion_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('promotions.id'), nullable=True),
        sa.Column('qr_code_url', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancellation_reason', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_bookings_reference', 'bookings', ['booking_reference'])

    # Payments table
    op.create_table(
        'payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id'), nullable=False),
        sa.Column('razorpay_order_id', sa.String(length=255), nullable=False, unique=True),
        sa.Column('razorpay_payment_id', sa.String(length=255), nullable=True),
        sa.Column('razorpay_signature', sa.String(length=255), nullable=True),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), server_default='INR', nullable=False),
        sa.Column('status', sa.Enum('created', 'captured', 'failed', 'refunded', name='paymentstatus'), nullable=False),
        sa.Column('failure_reason', sa.String(length=255), nullable=True),
        sa.Column('refund_id', sa.String(length=255), nullable=True),
        sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_payments_razorpay_order_id', 'payments', ['razorpay_order_id'])

    # Reviews table
    op.create_table(
        'reviews',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('cafe_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cafes.id'), nullable=False),
        sa.Column('gamer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id'), nullable=False, unique=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('is_visible', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

def downgrade() -> None:
    op.drop_table('reviews')
    op.drop_table('payments')
    op.drop_table('bookings')
    op.drop_table('promotions')
    op.drop_table('hardware_tiers')
    op.drop_table('cafes')
    op.drop_table('users')
    
    op.execute('DROP TYPE IF EXISTS userrole;')
    op.execute('DROP TYPE IF EXISTS verificationstatus;')
    op.execute('DROP TYPE IF EXISTS bookingstatus;')
    op.execute('DROP TYPE IF EXISTS paymentstatus;')
