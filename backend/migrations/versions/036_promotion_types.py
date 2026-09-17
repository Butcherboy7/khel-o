"""add promotion_type, fixed-amount/fixed-price fields; discount_percentage nullable

Revision ID: 036
Revises: 035
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None

promotion_type_enum = sa.Enum('percentage', 'fixed_amount', 'fixed_price', name='promotiontype')


def upgrade():
    promotion_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'promotions',
        sa.Column('promotion_type', promotion_type_enum, nullable=False, server_default='percentage'),
    )
    op.add_column('promotions', sa.Column('fixed_discount_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column('promotions', sa.Column('fixed_price_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column('promotions', sa.Column('min_duration_hours', sa.Numeric(4, 2), nullable=True))
    # batch_alter_table so this also works on SQLite (used by local dev/tests),
    # which has no ALTER COLUMN and needs the recreate-and-copy strategy;
    # on Postgres this still compiles to a plain ALTER TABLE.
    with op.batch_alter_table('promotions') as batch_op:
        batch_op.alter_column('discount_percentage', nullable=True)


def downgrade():
    with op.batch_alter_table('promotions') as batch_op:
        batch_op.alter_column('discount_percentage', nullable=False)
    op.drop_column('promotions', 'min_duration_hours')
    op.drop_column('promotions', 'fixed_price_amount')
    op.drop_column('promotions', 'fixed_discount_amount')
    op.drop_column('promotions', 'promotion_type')
    promotion_type_enum.drop(op.get_bind(), checkfirst=True)
