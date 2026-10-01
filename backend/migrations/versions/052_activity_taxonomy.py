"""activity taxonomy: hardware_tiers.taxonomy_key + attributes (additive)

Revision ID: 052
Revises: 051
Create Date: 2026-10-01

Purely additive: two new columns, nothing existing is altered. The backfill
only fills taxonomy_key where the tier's platform / name / activity_kind
clearly identifies one activity; anything ambiguous ("Snooker / Pool") or
unrecognised stays NULL for the owner to pick. Pricing/booking never read it.
"""
from alembic import op
import sqlalchemy as sa

revision = '052'
down_revision = '051'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('hardware_tiers', sa.Column('taxonomy_key', sa.String(80), nullable=True))
    op.add_column(
        'hardware_tiers',
        sa.Column('attributes', sa.JSON(), nullable=False, server_default='{}'),
    )
    op.create_index('ix_hardware_tiers_taxonomy_key', 'hardware_tiers', ['taxonomy_key'])

    from app.core.taxonomy import classify_gaming_tier, classify_name

    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, name, tier_type, platform::text AS platform, activity_kind FROM hardware_tiers"
    )).fetchall()
    for r in rows:
        if r.tier_type == 'activity':
            key = classify_name(r.name, r.activity_kind)
        else:
            key = classify_gaming_tier(r.name, r.platform)
        if key:
            conn.execute(
                sa.text("UPDATE hardware_tiers SET taxonomy_key = :k WHERE id = :i"),
                {"k": key, "i": r.id},
            )


def downgrade():
    op.drop_index('ix_hardware_tiers_taxonomy_key', table_name='hardware_tiers')
    op.drop_column('hardware_tiers', 'attributes')
    op.drop_column('hardware_tiers', 'taxonomy_key')
