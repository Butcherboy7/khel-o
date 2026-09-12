"""Add khelo_code to promotions (KHELO promo code + QR redemption)

Revision ID: 025
Revises: 024
Create Date: 2026-09-08

"""
from alembic import op
import sqlalchemy as sa

revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'promotions',
        sa.Column('khelo_code', sa.String(length=20), nullable=True),
    )
    # Unique so two promotions (even across different cafés) can never share
    # a redeemable code — the redeem-by-code lookup has no other way to
    # disambiguate which promotion a scanned/typed code refers to.
    op.create_index(
        op.f('ix_promotions_khelo_code'),
        'promotions',
        ['khelo_code'],
        unique=True,
    )


def downgrade():
    op.drop_index(op.f('ix_promotions_khelo_code'), table_name='promotions')
    op.drop_column('promotions', 'khelo_code')
