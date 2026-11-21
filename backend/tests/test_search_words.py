from app.core.search_words import strip_gta6_words


def test_gta6_variants():
    for q in ["gta", "Gta 6", "GTA6", "gta vi", "Grand Theft Auto 6", "gta 6 cafe near me"]:
        assert strip_gta6_words(q) == ("", True), q


def test_gta6_keeps_other_words():
    assert strip_gta6_words("gta 6 kukatpally") == ("kukatpally", True)


def test_gta5_and_names_untouched():
    assert strip_gta6_words("gta 5") == ("gta 5", False)
    assert strip_gta6_words("gta v") == ("gta v", False)
    assert strip_gta6_words("rockstar") == ("rockstar", False)
    assert strip_gta6_words("gtx 4060") == ("gtx 4060", False)
