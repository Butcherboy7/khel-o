"""Unit tests for scripts/run_payout_jobs.py's scheduling logic — the piece
that decides *whether* the weekly allocation actually runs on a given day,
since the cron entry itself fires daily (see deploy/cron/khelo-maintenance)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from scripts.run_payout_jobs import _run_weekly


@pytest.mark.asyncio
async def test_weekly_skips_when_not_due(monkeypatch):
    monkeypatch.setattr("app.config.settings.WEEKLY_PAYOUT_WEEKDAY", 0)  # Monday
    tuesday = datetime(2026, 9, 22, tzinfo=timezone.utc)  # a Tuesday
    with patch("scripts.run_payout_jobs.datetime") as mock_dt, \
         patch("app.repositories.cafe_payout_repository.CafePayoutRepository.run_weekly_allocation") as mock_run:
        mock_dt.now.return_value = tuesday
        await _run_weekly(force=False)
        mock_run.assert_not_called()


@pytest.mark.asyncio
async def test_weekly_runs_when_forced_even_if_not_due(monkeypatch):
    monkeypatch.setattr("app.config.settings.WEEKLY_PAYOUT_WEEKDAY", 0)
    tuesday = datetime(2026, 9, 22, tzinfo=timezone.utc)

    class _FakeUser:
        id = uuid4()

    with patch("scripts.run_payout_jobs.datetime") as mock_dt, \
         patch("scripts.run_payout_jobs.AsyncSessionLocal") as mock_session_factory, \
         patch("app.repositories.cafe_payout_repository.CafePayoutRepository.run_weekly_allocation", new_callable=AsyncMock) as mock_run:
        mock_dt.now.return_value = tuesday
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=AsyncMock(scalars=lambda: AsyncMock(first=lambda: _FakeUser())))
        mock_session_factory.return_value.__aenter__.return_value = mock_session
        mock_run.return_value = []

        await _run_weekly(force=True)
        mock_run.assert_called_once()
