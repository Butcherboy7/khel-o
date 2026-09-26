"""cafes.slug — readable public URL key (/cafe/<slug>)

Backfills every existing café, oldest first so the earliest listing keeps
the clean slug if two share a name and city.

Revision ID: 047
Revises: 046
Create Date: 2026-09-26
"""
import re
import unicodedata

from alembic import op
import sqlalchemy as sa

revision = '047'
down_revision = '046'
branch_labels = None
depends_on = None


# Frozen copy of app/core/slug.py as of this revision — migrations must not
# change behaviour when app code later does.
def _slugify(text):
    ascii_text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "cafe"


def _base(name, city):
    n, c = _slugify(name), _slugify(city)
    return n[:150] if (c in n.split("-") or n.endswith(c)) else f"{n}-{c}"[:150]


def _unique(base, taken):
    if base not in taken:
        return base
    i = 2
    while f"{base}-{i}" in taken:
        i += 1
    return f"{base}-{i}"


def upgrade():
    op.add_column('cafes', sa.Column('slug', sa.String(160), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, name, city FROM cafes ORDER BY created_at, id")).all()
    taken: set[str] = set()
    for cafe_id, name, city in rows:
        slug = _unique(_base(name, city), taken)
        taken.add(slug)
        bind.execute(sa.text("UPDATE cafes SET slug = :slug WHERE id = :id"), {"slug": slug, "id": cafe_id})

    op.create_index('ix_cafes_slug', 'cafes', ['slug'], unique=True)


def downgrade():
    op.drop_index('ix_cafes_slug', table_name='cafes')
    op.drop_column('cafes', 'slug')
