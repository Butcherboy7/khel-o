"""add changes_requested verification status; backfill flat photo URLs into
categorized {url, category} objects

Revision ID: 032
Revises: 031
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
import json

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None

cafes_table = sa.table(
    'cafes',
    sa.column('id', sa.Uuid()),
    sa.column('photos', sa.JSON()),
)


def _backfill_photos(value):
    """A flat list of URL strings (the only shape that existed before this
    migration) has no recorded category, so every entry defaults to
    'exterior' — a reasonable guess for test data (see spec), not a claim of
    accuracy. A list already made of {url, category} objects passes through
    unchanged."""
    if not value:
        return []
    if isinstance(value[0], dict):
        return value
    return [{"url": url, "category": "exterior"} for url in value]


def upgrade():
    # SQLite has no enum type — nothing to alter there for CHANGES_REQUESTED.
    if op.get_bind().dialect.name == 'postgresql':
        op.execute("ALTER TYPE verificationstatus ADD VALUE IF NOT EXISTS 'changes_requested'")

    bind = op.get_bind()
    rows = bind.execute(sa.select(cafes_table.c.id, cafes_table.c.photos)).fetchall()
    for row in rows:
        raw = row.photos
        if isinstance(raw, str):
            raw = json.loads(raw) if raw else []
        backfilled = _backfill_photos(raw)
        if backfilled != raw:
            bind.execute(
                cafes_table.update()
                .where(cafes_table.c.id == row.id)
                .values(photos=backfilled)
            )


def downgrade():
    # Postgres cannot drop an enum value (matches this repo's convention of
    # not reversing enum additions — see migrations 022, 028). Flattening
    # categorized photos back to bare URLs is lossy and unnecessary for the
    # same reason as migration 031's downgrade. No-op.
    pass
