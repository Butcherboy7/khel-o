"""add rejection_reason to cafes

Revision ID: 005_add_rejection_reason
Revises: 004_add_reminder_sent
Create Date: 2026-07-28 19:23:45.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '005_add_rejection_reason'
down_revision: Union[str, None] = '004_add_reminder_sent'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column(
        'cafes',
        sa.Column('rejection_reason', sa.String(length=500), nullable=True)
    )

def downgrade() -> None:
    op.drop_column('cafes', 'rejection_reason')
