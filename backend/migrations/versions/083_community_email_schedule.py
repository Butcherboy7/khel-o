"""community email schedule: three campaigns (a, b, c) and a delivery log

Additive. Seeds the three emails the admin approved (times IST, stored UTC):
  a  Tue 10 Nov 2026 19:30 IST   b  Fri 13 Nov 2026 19:30 IST   c  Sun 15 Nov 2026 19:00 IST
A campaign never sends until the admin has sent themselves a test of it.

Revision ID: 083
Revises: 082
Create Date: 2026-11-09
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = '083'
down_revision = '082'
branch_labels = None
depends_on = None

SEED = [
    ('a', '12 players, 1 champion. You missed it.', datetime(2026, 11, 10, 14, 0, tzinfo=timezone.utc)),
    ('b', 'Which game should Challenge #02 be?', datetime(2026, 11, 13, 14, 0, tzinfo=timezone.utc)),
    ('c', 'Quick one from KHEL-O', datetime(2026, 11, 15, 13, 30, tzinfo=timezone.utc)),
]


def upgrade():
    t = op.create_table(
        'community_email_campaigns',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('variant', sa.String(1), nullable=False, unique=True),
        sa.Column('subject', sa.String(160), nullable=False),
        sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(12), nullable=False, server_default='scheduled'),
        sa.Column('tested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sent_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        'community_email_deliveries',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('campaign_id', sa.Uuid(), sa.ForeignKey('community_email_campaigns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('campaign_id', 'email', name='uq_email_delivery_once'),
    )
    op.create_index('ix_community_email_deliveries_campaign_id', 'community_email_deliveries', ['campaign_id'])
    op.bulk_insert(t, [
        {'id': uuid.uuid4(), 'variant': v, 'subject': s, 'scheduled_for': when, 'status': 'scheduled',
         'sent_count': 0, 'failed_count': 0, 'created_at': datetime.now(timezone.utc)}
        for v, s, when in SEED
    ])


def downgrade():
    op.drop_index('ix_community_email_deliveries_campaign_id', table_name='community_email_deliveries')
    op.drop_table('community_email_deliveries')
    op.drop_table('community_email_campaigns')
