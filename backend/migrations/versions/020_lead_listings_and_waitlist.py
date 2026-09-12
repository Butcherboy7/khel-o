"""lead listings and cafe waitlist

Adds:
  - cafes.is_lead_listing, marking cafés KHEL-O listed from research that have
    not yet agreed to take bookings. Deliberately absent from the customer
    search filter so these cafés stay visible; booking creation rejects them.
  - cafe_waitlist, one row per person per café asking to be told when booking
    opens. The partial unique indexes are load-bearing: the count is shown to
    players and quoted to café owners as real demand.
  - a composite index on analytics_events(cafe_id, event_type, created_at);
    cafe_id was the only column on that table without one, and the owner
    demand summary filters on all three.

Revision ID: 020
Revises: 019
"""
import sqlalchemy as sa
from alembic import op

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'cafes',
        sa.Column('is_lead_listing', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # The cafés created by scripts/seed_lead_cafes.py are lead listings; they
    # are the only rows using an @khel-o.com placeholder address.
    op.execute("UPDATE cafes SET is_lead_listing = true WHERE email LIKE '%@khel-o.com'")

    op.create_table(
        'cafe_waitlist',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('cafe_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('session_id', sa.String(length=64), nullable=False),
        sa.Column('contact', sa.String(length=255), nullable=True),
        sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['cafe_id'], ['cafes.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_cafe_waitlist_cafe_id', 'cafe_waitlist', ['cafe_id'])
    op.create_index('ix_cafe_waitlist_user_id', 'cafe_waitlist', ['user_id'])
    op.create_index('ix_cafe_waitlist_session_id', 'cafe_waitlist', ['session_id'])

    # One vote per person per café. Signed-in visitors are keyed on user_id,
    # signed-out ones on session_id, so the two cases need separate partial
    # indexes rather than one composite unique.
    op.create_index(
        'uq_waitlist_cafe_user', 'cafe_waitlist', ['cafe_id', 'user_id'],
        unique=True, postgresql_where=sa.text('user_id IS NOT NULL'),
        sqlite_where=sa.text('user_id IS NOT NULL'),
    )
    op.create_index(
        'uq_waitlist_cafe_session', 'cafe_waitlist', ['cafe_id', 'session_id'],
        unique=True, postgresql_where=sa.text('user_id IS NULL'),
        sqlite_where=sa.text('user_id IS NULL'),
    )

    op.create_index(
        'ix_analytics_events_cafe_event_time', 'analytics_events',
        ['cafe_id', 'event_type', 'created_at'],
    )


def downgrade():
    op.drop_index('ix_analytics_events_cafe_event_time', table_name='analytics_events')
    op.drop_index('uq_waitlist_cafe_session', table_name='cafe_waitlist')
    op.drop_index('uq_waitlist_cafe_user', table_name='cafe_waitlist')
    op.drop_index('ix_cafe_waitlist_session_id', table_name='cafe_waitlist')
    op.drop_index('ix_cafe_waitlist_user_id', table_name='cafe_waitlist')
    op.drop_index('ix_cafe_waitlist_cafe_id', table_name='cafe_waitlist')
    op.drop_table('cafe_waitlist')
    op.drop_column('cafes', 'is_lead_listing')
