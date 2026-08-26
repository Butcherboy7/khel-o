import pytest
from app.models.hardware_tier import PlatformType
from app.services.platform_derivation import derive_tier_display, PLATFORM_MODELS


def test_pc_platform_derives_gpu_spec_and_name():
    specs, name = derive_tier_display(PlatformType.PC, "RTX 4070")
    assert specs == {"gpu": "NVIDIA RTX 4070"}
    assert name == "RTX 4070 PC"


def test_playstation_platform_derives_console_spec_and_name():
    specs, name = derive_tier_display(PlatformType.PLAYSTATION, "PS5")
    assert specs == {"console": "PlayStation 5"}
    assert name == "PlayStation 5"


def test_other_platform_uses_model_as_free_text_label():
    specs, name = derive_tier_display(PlatformType.OTHER, "VR Arcade Pod")
    assert specs == {"other": "VR Arcade Pod"}
    assert name == "VR Arcade Pod"


def test_none_platform_returns_empty_specs_and_generic_name():
    specs, name = derive_tier_display(None, None)
    assert specs == {}
    assert name == "Gaming Station"


def test_unknown_model_for_platform_raises():
    with pytest.raises(ValueError, match="not a valid model"):
        derive_tier_display(PlatformType.PLAYSTATION, "Xbox Series X")


def test_platform_models_covers_every_platform_type():
    for p in PlatformType:
        if p != PlatformType.OTHER:
            assert p.value in PLATFORM_MODELS
            assert len(PLATFORM_MODELS[p.value]) > 0


def test_xbox_platform_derives_console_spec_and_name():
    specs, name = derive_tier_display(PlatformType.XBOX, "Series X")
    assert specs == {"console": "Xbox Series X"}
    assert name == "Xbox Series X"


def test_nintendo_platform_derives_console_spec_and_name():
    specs, name = derive_tier_display(PlatformType.NINTENDO, "Switch OLED")
    assert specs == {"console": "Nintendo Switch OLED"}
    assert name == "Nintendo Switch OLED"


def test_custom_model_preserves_console_platform_identity():
    """Custom models must identify which console platform to prevent ambiguity."""
    playstation_specs, playstation_name = derive_tier_display(PlatformType.PLAYSTATION, "Custom")
    xbox_specs, xbox_name = derive_tier_display(PlatformType.XBOX, "Custom")
    nintendo_specs, nintendo_name = derive_tier_display(PlatformType.NINTENDO, "Custom")

    # All three should include their platform name
    assert "PlayStation" in playstation_name
    assert "Xbox" in xbox_name
    assert "Nintendo" in nintendo_name

    # All three should produce different outputs (no platform identity collapse)
    assert playstation_name != xbox_name
    assert xbox_name != nintendo_name
    assert playstation_name != nintendo_name

    # Specs should also differ
    assert playstation_specs != xbox_specs
    assert xbox_specs != nintendo_specs
    assert playstation_specs != nintendo_specs
