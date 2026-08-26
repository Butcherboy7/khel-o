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
    import pytest
    with pytest.raises(ValueError, match="not a valid model"):
        derive_tier_display(PlatformType.PLAYSTATION, "Xbox Series X")


def test_platform_models_covers_every_platform_type():
    for p in PlatformType:
        if p != PlatformType.OTHER:
            assert p.value in PLATFORM_MODELS
            assert len(PLATFORM_MODELS[p.value]) > 0
