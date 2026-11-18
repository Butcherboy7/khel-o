"""cafe suggestions: players tell us about cafes that are not on KHEL-O yet

Revision ID: 093
Revises: 092
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = '093'
down_revision = '092'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'cafe_suggestions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('cafe_name', sa.String(120), nullable=False),
        sa.Column('city', sa.String(80), nullable=False),
        sa.Column('maps_url', sa.String(500), nullable=True),
        sa.Column('cafe_phone', sa.String(20), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('suggester_name', sa.String(80), nullable=False),
        sa.Column('suggester_phone', sa.String(20), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, server_default='new'),
        sa.Column('source', sa.String(80), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_cafe_suggestions_city', 'cafe_suggestions', ['city'])
    op.create_index('ix_cafe_suggestions_status', 'cafe_suggestions', ['status'])


def downgrade():
    op.drop_index('ix_cafe_suggestions_status', table_name='cafe_suggestions')
    op.drop_index('ix_cafe_suggestions_city', table_name='cafe_suggestions')
    op.drop_table('cafe_suggestions')
