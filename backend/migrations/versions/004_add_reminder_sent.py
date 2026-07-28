"""add reminder_sent to bookings

Revision ID: 004_add_reminder_sent
Revises: 003_cafe_search
Create Date: 2026-07-28 19:06:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '004_add_reminder_sent'
down_revision: Union[str, None] = '003_cafe_search'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column(
        'bookings',
        sa.Column('reminder_sent', sa.Boolean(), server_default='false', nullable=False)
    )

def downgrade() -> None:
    op.drop_column('bookings', 'reminder_sent')
