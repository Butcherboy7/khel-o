"""003_cafe_search

Revision ID: 003_cafe_search
Revises: 002_add_indexes
Create Date: 2026-01-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003_cafe_search'
down_revision: Union[str, None] = '002_add_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cafes_name_trgm ON cafes USING gin (name gin_trgm_ops);")
    op.create_index('ix_cafes_is_active', 'cafes', ['is_active'])

def downgrade() -> None:
    op.drop_index('ix_cafes_is_active', table_name='cafes')
    op.execute("DROP INDEX IF EXISTS ix_cafes_name_trgm;")
