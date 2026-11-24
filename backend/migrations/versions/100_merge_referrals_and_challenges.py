"""Join the two 097 branches: main's drop_setup_options and the referrals/team-challenge chain.

Revision ID: 100
Revises: 097, 099
"""
from typing import Sequence, Union

revision: str = '100'
down_revision: Union[str, Sequence[str], None] = ('097', '099')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
