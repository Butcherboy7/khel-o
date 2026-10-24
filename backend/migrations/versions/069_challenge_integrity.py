"""challenge integrity: one current reward per kind, finish time, result
type and tiebreaks, how a move-up was told, consent version, plan settings

Additive only: new nullable columns and one partial unique index. Downgrade
drops them again.

The index allows one current (not superseded) reward per challenge and kind.
If any challenge already has two current rewards of one kind, the upgrade
stops instead of choosing between them: those need a person to look.

Revision ID: 069
Revises: 068
Create Date: 2026-10-24
"""
from alembic import op
import sqlalchemy as sa


revision = '069'
down_revision = '068'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('offer_campaigns', sa.Column('superseded_at', sa.DateTime(timezone=True), nullable=True))

    dupes = op.get_bind().execute(sa.text(
        "SELECT challenge_id, reward_kind, count(*) FROM offer_campaigns "
        "WHERE challenge_id IS NOT NULL GROUP BY challenge_id, reward_kind HAVING count(*) > 1"
    )).fetchall()
    if dupes:
        listed = ", ".join(f"{c}/{k} ({n})" for c, k, n in dupes)
        raise RuntimeError(f"Duplicate challenge rewards need a manual review before 069: {listed}")

    op.create_index(
        'uq_offer_campaigns_challenge_reward', 'offer_campaigns', ['challenge_id', 'reward_kind'],
        unique=True, postgresql_where=sa.text('challenge_id IS NOT NULL AND superseded_at IS NULL'),
    )

    op.add_column('challenges', sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('challenges', sa.Column('result_type', sa.String(length=10), nullable=True))
    op.add_column('challenges', sa.Column('plan_config', sa.JSON(), nullable=True))

    op.add_column('challenge_entries', sa.Column('told_via', sa.String(length=10), nullable=True))
    op.add_column('challenge_entries', sa.Column('consent_version', sa.String(length=20), nullable=True))

    op.add_column('challenge_matches', sa.Column('tiebreak', sa.String(length=12), nullable=True))
    op.add_column('challenge_matches', sa.Column('tiebreak_a', sa.Integer(), nullable=True))
    op.add_column('challenge_matches', sa.Column('tiebreak_b', sa.Integer(), nullable=True))


def downgrade():
    for col in ('tiebreak_b', 'tiebreak_a', 'tiebreak'):
        op.drop_column('challenge_matches', col)
    for col in ('consent_version', 'told_via'):
        op.drop_column('challenge_entries', col)
    for col in ('plan_config', 'result_type', 'finished_at'):
        op.drop_column('challenges', col)
    op.drop_index('uq_offer_campaigns_challenge_reward', table_name='offer_campaigns')
    op.drop_column('offer_campaigns', 'superseded_at')
