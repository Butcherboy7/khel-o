import pytest

from app.core import taxonomy
from app.core.activities import tier_activity, activity_key


class _T:  # minimal tier stand-in
    def __init__(self, **kw):
        self.tier_type = kw.get("tier_type", "activity")
        self.activity_kind = kw.get("activity_kind")
        self.platform = kw.get("platform")
        self.name = kw.get("name")
        self.taxonomy_key = kw.get("taxonomy_key")


def test_data_is_consistent():
    seen = set()
    for a in taxonomy.load()["activities"]:
        assert a["key"] not in seen
        seen.add(a["key"])
        for s in a["styles"]:
            assert s["key"].startswith(a["key"] + ".")
            assert s["key"] not in seen
            seen.add(s["key"])
    assert taxonomy.activity_key_for("pool.american") == "pool"
    assert taxonomy.activity_key_for("snooker") == "snooker"
    assert taxonomy.activity_key_for("nope") is None


@pytest.mark.parametrize("name,kind,expected", [
    ("Snooker / Pool", "Snooker / Pool", None),          # ambiguous: never guessed
    ("snooker", None, "snooker"),
    ("Sim Racing Motion Rig", None, "racing-simulator.motion"),
    ("VR (Meta Quest 3)", None, "vr"),
    ("Bowling", "Bowling", "bowling"),
    ("PAYMENT TESTING", None, None),
    ("Air Hockey", "Air Hockey", "air-hockey"),
    ("English billiards table", None, "billiards"),
])
def test_classify_name(name, kind, expected):
    assert taxonomy.classify_name(name, kind) == expected


@pytest.mark.parametrize("name,platform,expected", [
    ("RTX 4070 Night Owl Zone", None, "pc-gaming"),
    ("Whatever", "pc", "pc-gaming"),
    ("PS5 VIP Pods", "playstation", "console.playstation"),
    ("Mystery Lounge", None, None),
    ("Snooker / Pool", "other", None),
])
def test_classify_gaming_tier(name, platform, expected):
    assert taxonomy.classify_gaming_tier(name, platform) == expected


def test_validate_attributes():
    assert taxonomy.validate_attributes("pool.american", {"table_size": "8ft"}) == {"table_size": "8ft"}
    assert taxonomy.validate_attributes("pool", {"table_size": ""}) == {}          # Don't know
    assert taxonomy.validate_attributes("pool", {"games_offered": ["8-ball"]}) == {"games_offered": ["8-ball"]}
    assert taxonomy.validate_attributes("pc-gaming", {"monitor_hz": "240", "ram_gb": 32}) == {"monitor_hz": "240", "ram_gb": 32}
    for key, attrs in [("pool", {"table_size": "20ft"}), ("pool", {"nope": 1}),
                       ("snooker", {"table_size": "8ft"}), (None, {"table_size": "8ft"}),
                       ("pc-gaming", {"ram_gb": "lots"})]:
        with pytest.raises(ValueError):
            taxonomy.validate_attributes(key, attrs)
    with pytest.raises(ValueError):
        taxonomy.validate_key("pool.french")
    assert taxonomy.validate_key("") is None


def test_activity_key_unchanged_when_unclassified_and_overridden_when_set():
    # unclassified legacy tier: behaves exactly as before
    assert tier_activity(_T(activity_kind="Snooker / Pool")) == (activity_key("Snooker / Pool"), "Snooker / Pool")
    # explicit classification wins, with the same stable keys
    assert tier_activity(_T(activity_kind="Snooker / Pool", taxonomy_key="pool.english")) == ("pool", "Pool")
    assert tier_activity(_T(tier_type="gaming", platform="playstation", taxonomy_key="console.playstation")) == ("console", "Console")
