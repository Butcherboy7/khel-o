"""community page without login: device votes, joins, leads, weekly post, group size

Additive. Votes and suggestions can now come from one phone (device_id) instead
of a signed-in user. Revision 080 sits on 077; the funnel branch has 078/079 and
needs an alembic merge revision when it joins this one.

Revision ID: 080
Revises: 077
Create Date: 2026-11-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '080'
down_revision = '077'
branch_labels = None
depends_on = None


def _id():
    return sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True)


def _now():
    return sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()'))


def upgrade():
    op.alter_column('community_poll_votes', 'user_id', nullable=True)
    op.add_column('community_poll_votes', sa.Column('device_id', sa.String(64), nullable=True))
    op.create_index('ix_community_poll_votes_device_id', 'community_poll_votes', ['device_id'])
    op.create_unique_constraint('uq_poll_vote_device', 'community_poll_votes', ['poll_id', 'device_id'])

    op.add_column('community_contributions', sa.Column('device_id', sa.String(64), nullable=True))
    op.add_column('community_contributions', sa.Column('submitter_name', sa.String(60), nullable=True))
    op.add_column('community_contributions', sa.Column('contact', sa.String(160), nullable=True))
    op.create_index('ix_community_contributions_device_id', 'community_contributions', ['device_id'])

    op.create_table(
        'community_joins', _id(),
        sa.Column('device_id', sa.String(64), nullable=False, unique=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('source', sa.String(60), nullable=True),
        sa.Column('in_app', sa.Boolean(), nullable=False, server_default=sa.false()),
        _now(),
    )
    op.create_index('ix_community_joins_device_id', 'community_joins', ['device_id'])
    op.create_index('ix_community_joins_user_id', 'community_joins', ['user_id'])
    op.create_index('ix_community_joins_source', 'community_joins', ['source'])

    op.create_table(
        'community_leads', _id(),
        sa.Column('device_id', sa.String(64), nullable=True),
        sa.Column('email', sa.String(254), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('source', sa.String(60), nullable=True),
        sa.Column('marketing_ok', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('unsubscribed', sa.Boolean(), nullable=False, server_default=sa.false()),
        _now(),
    )
    op.create_index('ix_community_leads_device_id', 'community_leads', ['device_id'])
    op.create_index('ix_community_leads_email', 'community_leads', ['email'])
    op.create_index('ix_community_leads_phone', 'community_leads', ['phone'])

    op.create_table(
        'community_posts', _id(),
        sa.Column('headline', sa.String(120), nullable=False),
        sa.Column('line', sa.String(200), nullable=True),
        sa.Column('image_url', sa.String(1000), nullable=True),
        sa.Column('button_label', sa.String(40), nullable=True),
        sa.Column('button_url', sa.String(300), nullable=True),
        _now(),
    )
    op.create_index('ix_community_posts_created_at', 'community_posts', ['created_at'])

    op.create_table(
        'community_group_sizes', _id(),
        sa.Column('size', sa.Integer(), nullable=False),
        _now(),
    )


def downgrade():
    op.drop_table('community_group_sizes')
    op.drop_table('community_posts')
    op.drop_table('community_leads')
    op.drop_table('community_joins')
    op.drop_index('ix_community_contributions_device_id', 'community_contributions')
    op.drop_column('community_contributions', 'contact')
    op.drop_column('community_contributions', 'submitter_name')
    op.drop_column('community_contributions', 'device_id')
    op.drop_constraint('uq_poll_vote_device', 'community_poll_votes')
    op.drop_index('ix_community_poll_votes_device_id', 'community_poll_votes')
    op.drop_column('community_poll_votes', 'device_id')
    op.alter_column('community_poll_votes', 'user_id', nullable=False)
