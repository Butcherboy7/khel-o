"""community email: replace the a/b/c plan with the six emails the owner chose (c1..c6)

Widens the variant column, removes the three unsent a/b/c campaigns, and schedules c1..c6
two days apart at 19:30 IST (stored UTC), 11 Nov to 21 Nov 2026. c3 is on a Sunday at 19:00 IST.
All six were test-sent to the owner first, so they are marked tested. Each can be paused or
cancelled from the admin Community emails page.

Revision ID: 084
Revises: 083
Create Date: 2026-11-09
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = '084'
down_revision = '083'
branch_labels = None
depends_on = None

UTC = timezone.utc
SEED = [
    ('c1', 'We have a confession', datetime(2026, 11, 11, 14, 0, tzinfo=UTC)),
    ('c2', 'Roast KHEL-O. Seriously.', datetime(2026, 11, 13, 14, 0, tzinfo=UTC)),
    ('c3', 'Are we the problem?', datetime(2026, 11, 15, 13, 30, tzinfo=UTC)),
    ('c4', 'One question. Zero wrong answers.', datetime(2026, 11, 17, 14, 0, tzinfo=UTC)),
    ('c5', "Who's your Tekken rival?", datetime(2026, 11, 19, 14, 0, tzinfo=UTC)),
    ('c6', "You've been promoted. No raise.", datetime(2026, 11, 21, 14, 0, tzinfo=UTC)),
]


def upgrade():
    op.alter_column('community_email_campaigns', 'variant', existing_type=sa.String(1), type_=sa.String(4), existing_nullable=False)
    op.execute("DELETE FROM community_email_campaigns WHERE variant IN ('a','b','c') AND sent_count = 0")
    t = sa.table(
        'community_email_campaigns',
        sa.column('id', sa.Uuid()), sa.column('variant', sa.String()), sa.column('subject', sa.String()),
        sa.column('scheduled_for', sa.DateTime(timezone=True)), sa.column('status', sa.String()),
        sa.column('tested_at', sa.DateTime(timezone=True)), sa.column('sent_count', sa.Integer()),
        sa.column('failed_count', sa.Integer()), sa.column('created_at', sa.DateTime(timezone=True)),
    )
    now = datetime.now(UTC)
    op.bulk_insert(t, [
        {'id': uuid.uuid4(), 'variant': v, 'subject': s, 'scheduled_for': when, 'status': 'scheduled',
         'tested_at': now, 'sent_count': 0, 'failed_count': 0, 'created_at': now}
        for v, s, when in SEED
    ])


def downgrade():
    op.execute("DELETE FROM community_email_campaigns WHERE variant IN ('c1','c2','c3','c4','c5','c6') AND sent_count = 0")
    op.alter_column('community_email_campaigns', 'variant', existing_type=sa.String(4), type_=sa.String(1), existing_nullable=False)
