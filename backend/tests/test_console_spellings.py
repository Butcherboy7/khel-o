"""Owners type consoles their own way: "PS-5", "PS_5", "PS 5" and "PS5" are one console (XQZ's bean-bag PS5)."""
from types import SimpleNamespace

import pytest

from app.core.fps_estimate import console_info
from app.core.game_platforms import tier_runs_gta6
from app.models.hardware_tier import PlatformType


@pytest.mark.parametrize("name", ["PS5", "PS 5", "PS-5", "PS_5", "PS-5 (Premium bean bags)", "PlayStation 5 Slim", "PS5 Slim"])
def test_every_ps5_spelling_is_a_ps5(name):
    assert console_info("playstation", {"console": name}, name, name)["key"] == "ps5"


@pytest.mark.parametrize("name", ["PS5 Pro", "PS-5 Pro", "PS_5 Pro", "PlayStation 5 Pro"])
def test_pro_spellings_are_the_pro(name):
    assert console_info("playstation", {"console": name}, name, name)["key"] == "ps5pro"


@pytest.mark.parametrize("name", ["PS4", "PS-4", "PS 4 Slim", "PlayStation 4 Slim"])
def test_a_ps4_is_never_a_ps5(name):
    assert console_info("playstation", {"console": name}, name, name)["key"] == "ps4"


@pytest.mark.parametrize("name,key", [("Series-X", "seriesx"), ("Nintendo Switch 2", "switch2"), ("Switch-2", "switch2")])
def test_other_hyphenated_consoles(name, key):
    platform = "xbox" if "Series" in name else "nintendo"
    assert console_info(platform, {"console": name}, name, name)["key"] == key


def test_xqz_bean_bag_ps5_runs_gta6():
    tier = SimpleNamespace(platform=PlatformType.PLAYSTATION, specs={"console": "PS-5 (Premium bean bags)"},
                           name="PS-5 (Premium bean bags)", model="PS-5 (Premium bean bags)", tier_type="gaming")
    assert tier_runs_gta6(tier) is True


@pytest.mark.parametrize("model,label,key", [("PS5 Slim", "PlayStation 5 Slim", "ps5"), ("PS4 Slim", "PlayStation 4 Slim", "ps4"),
                                             ("Switch 2", "Nintendo Switch 2", "switch2")])
def test_new_picker_models_save_and_are_recognised(model, label, key):
    from app.services.platform_derivation import derive_tier_display
    platform = PlatformType.NINTENDO if "Switch" in model else PlatformType.PLAYSTATION
    specs, name = derive_tier_display(platform, model)
    assert name == label and specs == {"console": label}
    assert console_info(platform.value, specs, name, model)["key"] == key
