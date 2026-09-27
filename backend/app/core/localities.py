"""Neighbourhood buckets for area analytics.

A shared location or a café's coordinates snaps to the nearest named
neighbourhood within MAX_KM, so "where players are" and "where cafés are"
use the same buckets. Centres are approximate (≈1 km) — good enough to
group, never shown as a pin. Add a row to cover a new area.
"""
from math import asin, cos, radians, sin, sqrt
from typing import Optional

MAX_KM = 3.5

LOCALITIES: dict[str, list[tuple[str, float, float]]] = {
    "Hyderabad": [
        ("Gachibowli", 17.4401, 78.3489),
        ("Financial District", 17.4125, 78.3440),
        ("Kokapet", 17.3967, 78.3355),
        ("HITEC City", 17.4474, 78.3762),
        ("Madhapur", 17.4483, 78.3915),
        ("Kondapur", 17.4617, 78.3643),
        ("Nallagandla", 17.4697, 78.3093),
        ("Lingampally", 17.4880, 78.3160),
        ("Chandanagar", 17.4930, 78.3290),
        ("Miyapur", 17.4962, 78.3571),
        ("Bachupally", 17.5446, 78.3640),
        ("Nizampet", 17.5173, 78.3847),
        ("Kukatpally", 17.4948, 78.3996),
        ("Moosapet", 17.4697, 78.4260),
        ("Erragadda", 17.4570, 78.4320),
        ("SR Nagar", 17.4435, 78.4421),
        ("Ameerpet", 17.4375, 78.4483),
        ("Begumpet", 17.4447, 78.4664),
        ("Panjagutta", 17.4260, 78.4512),
        ("Khairatabad", 17.4115, 78.4610),
        ("Jubilee Hills", 17.4326, 78.4071),
        ("Banjara Hills", 17.4138, 78.4398),
        ("Manikonda", 17.4026, 78.3869),
        ("Narsingi", 17.3865, 78.3576),
        ("Tolichowki", 17.3992, 78.4147),
        ("Mehdipatnam", 17.3957, 78.4401),
        ("Attapur", 17.3713, 78.4297),
        ("Himayatnagar", 17.4015, 78.4872),
        ("Abids", 17.3930, 78.4760),
        ("Charminar", 17.3616, 78.4747),
        ("Malakpet", 17.3740, 78.5010),
        ("Dilsukhnagar", 17.3688, 78.5247),
        ("LB Nagar", 17.3457, 78.5522),
        ("Uppal", 17.4058, 78.5591),
        ("Habsiguda", 17.4172, 78.5424),
        ("Tarnaka", 17.4278, 78.5327),
        ("Secunderabad", 17.4399, 78.4983),
        ("Malkajgiri", 17.4531, 78.5279),
        ("AS Rao Nagar / ECIL", 17.4795, 78.5552),
        ("Alwal", 17.5020, 78.5100),
        ("Bowenpally", 17.4722, 78.4847),
        ("Kompally", 17.5362, 78.4844),
        ("Shamshabad", 17.2543, 78.3923),
    ],
}

# Rough city centres, for a location outside every listed neighbourhood.
CITY_CENTRES: dict[str, tuple[float, float]] = {
    "Hyderabad": (17.3850, 78.4867),
    "Bengaluru": (12.9716, 77.5946),
    "Mumbai": (19.0760, 72.8777),
    "Delhi": (28.6139, 77.2090),
    "Chennai": (13.0827, 80.2707),
    "Pune": (18.5204, 73.8567),
    "Kolkata": (22.5726, 88.3639),
}
CITY_RADIUS_KM = 40


def km_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))


def city_for(lat: float, lng: float) -> Optional[str]:
    best = min(CITY_CENTRES.items(), key=lambda kv: km_between(lat, lng, *kv[1]))
    return best[0] if km_between(lat, lng, *best[1]) <= CITY_RADIUS_KM else None


def locality_for(lat: Optional[float], lng: Optional[float]) -> tuple[Optional[str], Optional[str]]:
    """(city, neighbourhood) for a point. Neighbourhood is None outside every
    listed one; city is None outside every known city."""
    if lat is None or lng is None:
        return None, None
    lat, lng = float(lat), float(lng)
    city = city_for(lat, lng)
    options = LOCALITIES.get(city or "", [])
    if not options:
        return city, None
    name, d = min(((n, km_between(lat, lng, a, b)) for n, a, b in options), key=lambda x: x[1])
    return city, (name if d <= MAX_KM else None)
