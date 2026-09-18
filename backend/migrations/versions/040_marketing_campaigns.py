"""add marketing campaigns table, seed rs100-drop

Revision ID: 040
Revises: 039
Create Date: 2026-09-18
"""
from alembic import op
import sqlalchemy as sa

revision = '040'
down_revision = '039'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'campaigns',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('source', sa.String(100), nullable=False),
        sa.Column('medium', sa.String(100), nullable=False),
        sa.Column('landing_page', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    campaigns = sa.table(
        'campaigns',
        sa.column('id', sa.String),
        sa.column('name', sa.String),
        sa.column('source', sa.String),
        sa.column('medium', sa.String),
        sa.column('landing_page', sa.String),
    )
    op.bulk_insert(campaigns, [{
        'id': 'rs100-drop',
        'name': '₹100 Physical QR Drop',
        'source': 'offline',
        'medium': 'qr',
        'landing_page': '/100',
    }])


def downgrade():
    op.drop_table('campaigns')
