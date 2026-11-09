"""community admin: photo wall, page settings, post pin/hide/schedule

Additive. Seeds the wall with the 9 Tekken #01 photos already on the page, so
nothing disappears when the page starts reading the wall from the database.

Revision ID: 082
Revises: 081
Create Date: 2026-11-09
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '082'
down_revision = '081'
branch_labels = None
depends_on = None

SEED = [
    ('full-house', 'Full house'), ('the-crowd', 'The crowd'), ('prize', 'Prize time'), ('couch', 'Trash talk'),
    ('locked-in', 'Focus mode'), ('sofa', 'The squad'), ('pit-lane', 'Pit stop'), ('headset', 'Locked in'),
    ('hands', 'Hands don’t lie'),
]


def upgrade():
    op.add_column('community_posts', sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('community_posts', sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('community_posts', sa.Column('show_from', sa.DateTime(timezone=True), nullable=True))
    op.add_column('community_posts', sa.Column('show_until', sa.DateTime(timezone=True), nullable=True))

    photos = op.create_table(
        'community_photos',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('url', sa.String(1000), nullable=False),
        sa.Column('caption', sa.String(120), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_hero', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.bulk_insert(photos, [
        {'id': uuid.uuid4(), 'url': f'/community/{name}.webp', 'caption': cap, 'position': n, 'is_hero': n == 0, 'hidden': False}
        for n, (name, cap) in enumerate(SEED)
    ])
    op.create_table(
        'community_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('data', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('community_settings')
    op.drop_table('community_photos')
    for c in ('show_until', 'show_from', 'hidden', 'pinned'):
        op.drop_column('community_posts', c)
