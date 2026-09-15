import pytest
import importlib.util
import pathlib


def _load_migration_031():
    spec = importlib.util.spec_from_file_location(
        "migration_031",
        pathlib.Path(__file__).resolve().parents[1] / "migrations" / "versions" / "031_platform_scoped_games.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_flat_games_list_backfilled_to_pc_dict():
    """Simulates a pre-migration row (flat list) and confirms the migration's
    backfill logic, exercised directly, produces the platform-keyed shape."""
    m = _load_migration_031()

    assert m._backfill_row(["Valorant", "GTA V"]) == {"pc": ["Valorant", "GTA V"]}
    assert m._backfill_row({"pc": ["Valorant"]}) == {"pc": ["Valorant"]}
    assert m._backfill_row([]) == {}
    assert m._backfill_row(None) == {}
