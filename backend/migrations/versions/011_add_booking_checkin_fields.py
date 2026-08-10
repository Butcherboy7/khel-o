"""Add checked_in_by and checked_in_at fields to bookings table

Revision ID: 011
Revises: 010
Create Date: 2026-08-10

"""
from alembic import op
import sqlalchemy as sa

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('bookings')]
    
    if 'checked_in_by' not in columns:
        op.add_column('bookings', sa.Column('checked_in_by', sa.String(32), nullable=True))
    if 'checked_in_at' not in columns:
        op.add_column('bookings', sa.Column('checked_in_at', sa.DateTime(timezone=True), nullable=True))
    if 'checkin_method' not in columns:
        op.add_column('bookings', sa.Column('checkin_method', sa.String(50), nullable=True))

def downgrade() -> None:
    op.drop_column('bookings', 'checkin_method')
    op.drop_column('bookings', 'checked_in_at')
    op.drop_column('bookings', 'checked_in_by')
