"""launch drops: seats the café sold offline

All additive and defaulted, so every existing reservation stays an online one:
- source: 'online' (paid in the app) or 'offline' (the café took it and the cash itself)
- guest_name / guest_phone / note: who the café wrote down for an offline seat

Revision ID: 086
Revises: 085
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = '086'
down_revision = '085'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('drop_reservations', sa.Column('source', sa.String(10), server_default='online', nullable=False))
    op.add_column('drop_reservations', sa.Column('guest_name', sa.String(120), nullable=True))
    op.add_column('drop_reservations', sa.Column('guest_phone', sa.String(20), nullable=True))
    op.add_column('drop_reservations', sa.Column('note', sa.String(200), nullable=True))


def downgrade():
    op.drop_column('drop_reservations', 'note')
    op.drop_column('drop_reservations', 'guest_phone')
    op.drop_column('drop_reservations', 'guest_name')
    op.drop_column('drop_reservations', 'source')
