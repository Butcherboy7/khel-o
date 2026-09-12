"""Launch-day cross-café isolation, part 2 (B-01 continued).

test_launch_invariants.py covers the 12 owner routes keyed by {cafe_id}.
This covers everything else that accepts someone else's resource id:
{booking_id}, {tier_id}, {staff_id}, {invitation_id}, and the cafeId query
parameter. See docs/LAUNCH_QA_PLAN.md §1.3.

"What permission bug could expose one café's data to another café?" — a 2xx
anywhere in this file is the answer, and it is a P0.
"""
import pytest
from uuid import uuid4

from app.models.booking import BookingStatus
from app.core.time import now_ist
from tests.conftest import auth_headers
from tests.test_launch_invariants import (
    _make_owner_and_cafe,
    _make_gamer,
    _booking_with_fee,
)


async def _two_owners_with_a_booking(db_session, tag):
    """Owner A holds a real café, tier and booking. Owner B is the attacker."""
    owner_a, cafe_a, tier_a = await _make_owner_and_cafe(db_session, f"{tag}_a")
    owner_b, cafe_b, tier_b = await _make_owner_and_cafe(db_session, f"{tag}_b")
    gamer = await _make_gamer(db_session)

    booking, fee = _booking_with_fee(
        cafe_a, tier_a, gamer.id, BookingStatus.CONFIRMED, now_ist().date(), base=100.0
    )
    db_session.add_all([booking, fee])
    await db_session.commit()
    return owner_a, cafe_a, tier_a, owner_b, booking


FOREIGN_BOOKING_ROUTES = [
    ("PATCH", "/api/v1/owner/bookings/{booking_id}/status"),
    ("POST",  "/api/v1/owner/bookings/{booking_id}/checkin"),
    ("POST",  "/api/v1/owner/bookings/{booking_id}/cancel"),
    ("PATCH", "/api/v1/owner/bookings/{booking_id}/release"),
]


@pytest.mark.parametrize("method,path", FOREIGN_BOOKING_ROUTES)
@pytest.mark.asyncio
async def test_owner_cannot_act_on_another_cafes_booking(
    db_session, async_client, method, path
):
    """Owner B must not be able to check in, cancel, release or re-status a
    booking belonging to Owner A's café."""
    _, _, _, owner_b, booking = await _two_owners_with_a_booking(
        db_session, f"bk_{uuid4().hex[:4]}"
    )
    url = path.format(booking_id=booking.id)
    res = await async_client.request(method, url, headers=auth_headers(owner_b), json={})

    assert res.status_code not in (200, 201, 204), (
        f"IDOR: {method} {path} returned {res.status_code} — Owner B acted on "
        "Owner A's booking."
    )


@pytest.mark.asyncio
async def test_owner_cannot_read_another_cafes_booking_detail(db_session, async_client):
    _, _, _, owner_b, booking = await _two_owners_with_a_booking(db_session, "read")
    res = await async_client.get(
        f"/api/v1/bookings/{booking.id}", headers=auth_headers(owner_b)
    )
    assert res.status_code not in (200,), (
        "Owner B read the full detail of a booking at Owner A's café"
    )


@pytest.mark.asyncio
async def test_owner_cannot_delete_another_cafes_tier(db_session, async_client):
    owner_a, cafe_a, tier_a, owner_b, _ = await _two_owners_with_a_booking(db_session, "tier")
    res = await async_client.delete(
        f"/api/v1/owner/cafes/{cafe_a.id}/tiers/{tier_a.id}",
        headers=auth_headers(owner_b),
    )
    assert res.status_code not in (200, 204), (
        f"IDOR: Owner B deleted a hardware tier from Owner A's café ({res.status_code})"
    )


@pytest.mark.asyncio
async def test_owner_cannot_confirm_another_cafes_tier_platform(db_session, async_client):
    owner_a, cafe_a, tier_a, owner_b, _ = await _two_owners_with_a_booking(db_session, "tierconf")
    res = await async_client.patch(
        f"/api/v1/owner/tiers/{tier_a.id}/confirm-platform",
        headers=auth_headers(owner_b),
        json={"platform": "PC", "model": "Custom"},
    )
    assert res.status_code not in (200, 201), (
        f"IDOR: Owner B mutated a tier belonging to Owner A ({res.status_code})"
    )


@pytest.mark.asyncio
async def test_cafe_id_query_param_cannot_leak_another_owners_bookings(
    db_session, async_client
):
    """The booking list takes cafeId as a query parameter — passing a foreign
    café id must not return that café's bookings."""
    owner_a, cafe_a, _, owner_b, booking = await _two_owners_with_a_booking(db_session, "qp")

    res = await async_client.get(
        f"/api/v1/owner/bookings?cafeId={cafe_a.id}", headers=auth_headers(owner_b)
    )
    if res.status_code == 200:
        payload = res.json()["data"]
        items = payload["items"] if isinstance(payload, dict) else payload
        returned_ids = {str(i.get("id")) for i in items}
        assert str(booking.id) not in returned_ids, (
            "IDOR: Owner B listed Owner A's bookings by passing a foreign cafeId"
        )
        assert items == [] or all(str(i.get("id")) != str(booking.id) for i in items)
    else:
        assert res.status_code in (400, 403, 404, 422)


@pytest.mark.asyncio
async def test_owner_cannot_remove_another_owners_staff(db_session, async_client):
    """Staff removal keyed by user id must be scoped to the caller's café."""
    owner_a, cafe_a, _, owner_b, _ = await _two_owners_with_a_booking(db_session, "staff")

    res = await async_client.delete(
        f"/api/v1/owner/staff/{owner_a.id}", headers=auth_headers(owner_b)
    )
    assert res.status_code not in (200, 204), (
        f"IDOR: Owner B removed staff from Owner A's café ({res.status_code})"
    )


@pytest.mark.asyncio
async def test_owner_cannot_revoke_another_cafes_staff_invitation(
    db_session, async_client
):
    owner_a, cafe_a, _, owner_b, _ = await _two_owners_with_a_booking(db_session, "invite")

    # The café is derived from the authenticated owner, not passed in — so
    # there is no cafeId to tamper with on creation. The attack surface is the
    # invitation id on the delete route below.
    created = await async_client.post(
        "/api/v1/owner/staff/invitations",
        headers=auth_headers(owner_a),
        json={
            "email": f"invitee_{uuid4().hex[:6]}@test.com",
            "fullName": "QA Invitee",
        },
    )
    if created.status_code not in (200, 201):
        pytest.skip(f"could not create an invitation to attack: {created.status_code}")

    data = created.json().get("data") or {}
    invitation_id = data.get("id") or (data.get("invitation") or {}).get("id")
    if not invitation_id:
        pytest.skip("invitation id not present in create response")

    res = await async_client.delete(
        f"/api/v1/owner/staff/invitations/{invitation_id}",
        headers=auth_headers(owner_b),
    )
    assert res.status_code not in (200, 204), (
        f"IDOR: Owner B revoked a staff invitation belonging to Owner A ({res.status_code})"
    )
