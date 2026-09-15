"""backfill supported_games flat lists into platform-keyed dicts

Revision ID: 031
Revises: 030
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
import json

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None

cafes_table = sa.table(
    'cafes',
    sa.column('id', sa.Uuid()),
    sa.column('supported_games', sa.JSON()),
)


def _backfill_row(value):
    """A flat list (the only shape that existed before this migration) is
    assumed to be PC titles — that was the only platform the old preset list
    (`PRESET_GAMES` in onboarding/page.tsx) ever offered. A dict is already
    in the new shape and passes through untouched. Anything falsy becomes {}."""
    if isinstance(value, dict):
        return value
    if isinstance(value, list) and value:
        return {"pc": value}
    return {}


def upgrade():
    bind = op.get_bind()
    rows = bind.execute(sa.select(cafes_table.c.id, cafes_table.c.supported_games)).fetchall()
    for row in rows:
        raw = row.supported_games
        if isinstance(raw, str):
            raw = json.loads(raw) if raw else []
        backfilled = _backfill_row(raw)
        if backfilled != raw:
            bind.execute(
                cafes_table.update()
                .where(cafes_table.c.id == row.id)
                .values(supported_games=backfilled)
            )


def downgrade():
    # Flattening a dict back into a single list would silently merge distinct
    # platforms' game lists together and lose which games belonged to which
    # platform — a lossy, one-way transform we don't want to auto-reverse.
    # Test data (see spec), so a no-op downgrade is an acceptable trade-off.
    pass
