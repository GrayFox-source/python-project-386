import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.booking_page import get_now
from app.models import BookingRecord
from tests.helpers import TEST_EMAIL, TEST_PASSWORD

NOW = datetime(2026, 1, 5, 5, tzinfo=UTC)
TUESDAY = "2026-01-06T06:00:00Z"
TUESDAY_LATER = "2026-01-06T06:30:00Z"
WEEKLY = {
    str(day): [{"start": "09:00", "end": "11:00"}] for day in range(1, 8)
}


def login(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200


def set_now(client: TestClient, value: datetime = NOW) -> None:
    client.app.dependency_overrides[get_now] = lambda: value


def setup(client: TestClient) -> dict[str, Any]:
    login(client)
    availability = client.post(
        "/hosts/me/availabilities",
        json={
            "name": "Рабочие часы",
            "timezone": "Europe/Moscow",
            "weekly": WEEKLY,
            "overrides": [],
        },
    )
    assert availability.status_code == 200, availability.text
    meeting_type = client.post(
        "/hosts/me/meeting-types",
        json={
            "title": "Консультация",
            "duration_minutes": 30,
            "format": "online",
            "slug": "consultation",
            "availability_id": availability.json()["id"],
            "minimum_notice_minutes": 0,
            "slot_interval_minutes": 30,
        },
    )
    assert meeting_type.status_code == 200, meeting_type.text
    set_now(client)
    return meeting_type.json()


def create_booking(
    client: TestClient,
    *,
    starts_at: str = TUESDAY,
    guest_name: str = "Иван",
    guest_email: str = "guest@example.com",
    comment: str | None = "Нужна консультация",
    idempotency_key: str | None = None,
):
    headers = (
        {"Idempotency-Key": idempotency_key}
        if idempotency_key is not None
        else {}
    )
    return client.post(
        "/book/consultation/bookings",
        headers=headers,
        json={
            "guest_name": guest_name,
            "guest_email": guest_email,
            "comment": comment,
            "starts_at": starts_at,
        },
    )


def get_slots(client: TestClient, date: str = "2026-01-06"):
    return client.get(
        "/book/consultation/slots",
        params={
            "from": date,
            "to": date,
            "timezone": "Europe/Moscow",
        },
    )


def test_create_booking_is_pending_with_token_and_expiry(
    client: TestClient,
) -> None:
    setup(client)

    response = create_booking(client)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["starts_at"] == "2026-01-06T06:00:00Z"
    assert body["ends_at"] == "2026-01-06T06:30:00Z"
    assert body["expires_at"] == "2026-01-06T05:00:00Z"
    assert body["guest_email"] == "guest@example.com"
    assert body["token"]
    assert body["booking_url"].endswith(f"/booking/{body['token']}")

    with client.app.state.session_factory() as session:
        record = session.scalar(select(BookingRecord))
        assert record is not None
        assert record.token_hash == hashlib.sha256(
            body["token"].encode()
        ).hexdigest()
        assert record.token_hash != body["token"]


def test_expiry_is_capped_at_twenty_four_hours(client: TestClient) -> None:
    setup(client)

    response = create_booking(client, starts_at="2026-01-07T06:00:00Z")

    assert response.status_code == 201, response.text
    assert response.json()["expires_at"] == "2026-01-06T05:00:00Z"


def test_idempotent_replay_returns_current_state_without_new_token(
    client: TestClient,
) -> None:
    setup(client)

    first = create_booking(client, idempotency_key="key-1")
    replay = create_booking(client, idempotency_key="key-1")
    reused = create_booking(
        client,
        starts_at=TUESDAY_LATER,
        idempotency_key="key-1",
    )

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["token"] is None
    assert replay.json()["booking_url"] is None
    assert reused.status_code == 409
    assert reused.json()["detail"]["code"] == "idempotency_key_reused"


def test_host_confirms_and_cancels_booking(client: TestClient) -> None:
    setup(client)
    created = create_booking(client).json()

    confirmed = client.post(
        f"/hosts/me/bookings/{created['id']}/confirm"
    )
    repeated = client.post(
        f"/hosts/me/bookings/{created['id']}/confirm"
    )
    cancelled = client.post(
        f"/hosts/me/bookings/{created['id']}/cancel",
        json={"cancellation_reason": "Не смогу провести встречу"},
    )
    after_cancel = client.post(
        f"/hosts/me/bookings/{created['id']}/confirm"
    )

    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert repeated.status_code == 409
    assert repeated.json()["detail"]["code"] == "invalid_state_transition"
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancelled_by"] == "host"
    assert (
        cancelled.json()["cancellation_reason"]
        == "Не смогу провести встречу"
    )
    assert after_cancel.status_code == 409
    assert after_cancel.json()["detail"]["code"] == "invalid_state_transition"


def test_guest_views_and_cancels_by_token(client: TestClient) -> None:
    setup(client)
    created = create_booking(client).json()
    token = created["token"]

    viewed = client.get(f"/bookings/{token}")
    cancelled = client.post(
        f"/bookings/{token}/cancel",
        json={"cancellation_reason": "Планы изменились"},
    )
    repeated = client.post(f"/bookings/{token}/cancel", json={})

    assert viewed.status_code == 200
    assert viewed.json()["status"] == "pending"
    assert viewed.json()["meeting_type"]["title"] == "Консультация"
    assert "id" not in viewed.json()
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancelled_by"] == "guest"
    assert cancelled.json()["cancellation_reason"] == "Планы изменились"
    assert repeated.status_code == 409
    assert repeated.json()["detail"]["code"] == "invalid_state_transition"


def test_unknown_token_returns_404(client: TestClient) -> None:
    setup(client)

    response = client.get("/bookings/not-a-real-token")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "booking_not_found"


def test_token_access_expires_seven_days_after_start(
    client: TestClient,
) -> None:
    setup(client)
    token = create_booking(client).json()["token"]

    set_now(client, datetime(2026, 1, 13, 6, 0, 1, tzinfo=UTC))
    expired = client.get(f"/bookings/{token}")

    assert expired.status_code == 404
    assert expired.json()["detail"]["code"] == "booking_not_found"


def test_lazy_expiry_frees_slot_and_allows_rebooking(
    client: TestClient,
) -> None:
    setup(client)
    first = create_booking(client)
    assert first.status_code == 201

    before_expiry = get_slots(client)
    assert "2026-01-06T06:00:00Z" not in [
        slot["start"] for slot in before_expiry.json()["days"][0]["slots"]
    ]

    set_now(client, datetime(2026, 1, 6, 5, 0, 1, tzinfo=UTC))
    after_expiry = get_slots(client)
    assert "2026-01-06T06:00:00Z" in [
        slot["start"] for slot in after_expiry.json()["days"][0]["slots"]
    ]

    first_id = first.json()["id"]
    old = client.get(f"/hosts/me/bookings/{first_id}")
    second = create_booking(client)

    assert old.json()["status"] == "expired"
    assert second.status_code == 201
    assert second.json()["id"] != first_id


def test_expired_booking_cannot_be_confirmed(client: TestClient) -> None:
    setup(client)
    created = create_booking(client).json()

    set_now(client, datetime(2026, 1, 6, 5, 0, 1, tzinfo=UTC))
    response = client.post(f"/hosts/me/bookings/{created['id']}/confirm")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_state_transition"


def test_actions_after_start_return_booking_started(
    client: TestClient,
) -> None:
    setup(client)
    created = create_booking(client).json()

    set_now(client, datetime(2026, 1, 6, 6, 0, tzinfo=UTC))
    confirm = client.post(f"/hosts/me/bookings/{created['id']}/confirm")
    cancel = client.post(f"/hosts/me/bookings/{created['id']}/cancel", json={})
    guest_cancel = client.post(
        f"/bookings/{created['token']}/cancel", json={}
    )

    assert confirm.status_code == 409
    assert confirm.json()["detail"]["code"] == "booking_started"
    assert cancel.status_code == 409
    assert cancel.json()["detail"]["code"] == "booking_started"
    assert guest_cancel.status_code == 409
    assert guest_cancel.json()["detail"]["code"] == "booking_started"


def test_booking_outside_slot_grid_returns_slot_unavailable(
    client: TestClient,
) -> None:
    setup(client)

    misaligned = create_booking(client, starts_at="2026-01-06T06:15:00Z")
    outside = create_booking(client, starts_at="2026-01-06T09:00:00Z")

    assert misaligned.status_code == 409
    assert misaligned.json()["detail"]["code"] == "slot_unavailable"
    assert outside.status_code == 409
    assert outside.json()["detail"]["code"] == "slot_unavailable"


def test_booking_unknown_or_archived_meeting_type(client: TestClient) -> None:
    setup(client)
    missing = client.post(
        "/book/knowledge/bookings",
        json={
            "guest_name": "Иван",
            "guest_email": "guest@example.com",
            "starts_at": TUESDAY,
        },
    )
    meeting_type = client.get("/book/consultation").json()
    client.post(f"/hosts/me/meeting-types/{meeting_type['id']}/archive")
    archived = create_booking(client)

    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "meeting_type_not_found"
    assert archived.status_code == 410
    assert archived.json()["detail"]["code"] == "meeting_type_archived"


def test_host_list_filters_and_paginates(client: TestClient) -> None:
    setup(client)
    first = create_booking(client).json()
    second = create_booking(client, starts_at=TUESDAY_LATER).json()
    client.post(f"/hosts/me/bookings/{first['id']}/confirm")

    pending = client.get("/hosts/me/bookings", params={"status": "pending"})
    confirmed = client.get(
        "/hosts/me/bookings", params={"status": "confirmed"}
    )
    page = client.get(
        "/hosts/me/bookings", params={"limit": 1, "offset": 1}
    )
    by_time = client.get(
        "/hosts/me/bookings",
        params={"from": TUESDAY, "to": TUESDAY_LATER},
    )

    assert pending.status_code == 200
    assert [item["id"] for item in pending.json()["items"]] == [second["id"]]
    assert pending.json()["total"] == 1
    assert confirmed.json()["items"][0]["id"] == first["id"]
    assert page.json()["total"] == 2
    assert len(page.json()["items"]) == 1
    assert [item["id"] for item in by_time.json()["items"]] == [
        first["id"],
        second["id"],
    ]


def test_slot_taken_when_another_booking_overlaps(client: TestClient) -> None:
    setup(client)
    create_booking(client)

    response = create_booking(client, starts_at=TUESDAY, guest_name="Пётр")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "slot_taken"


def test_race_for_the_same_slot_has_one_winner(client: TestClient) -> None:
    setup(client)

    def book(name: str):
        return create_booking(
            client, guest_name=name, guest_email=f"{name}@example.com"
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(book, ["Анна", "Борис"]))

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [201, 409]
    loser = next(
        response for response in responses if response.status_code == 409
    )
    assert loser.json()["detail"]["code"] == "slot_taken"


def test_race_confirm_and_cancel_is_consistent(client: TestClient) -> None:
    setup(client)
    created = create_booking(client).json()

    def confirm():
        return client.post(f"/hosts/me/bookings/{created['id']}/confirm")

    def cancel():
        return client.post(
            f"/hosts/me/bookings/{created['id']}/cancel", json={}
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        confirm_future = pool.submit(confirm)
        cancel_future = pool.submit(cancel)
        confirm_response = confirm_future.result()
        cancel_response = cancel_future.result()

    assert cancel_response.status_code == 200
    assert confirm_response.status_code in {200, 409}
    final = client.get(f"/hosts/me/bookings/{created['id']}")
    assert final.json()["status"] == "cancelled"


def test_nested_expiry_is_not_before_creation(client: TestClient) -> None:
    setup(client)
    created = create_booking(client).json()
    starts = datetime.fromisoformat(created["starts_at"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(
        created["expires_at"].replace("Z", "+00:00")
    )

    assert expires == min(NOW + timedelta(hours=24), starts)


def test_meeting_type_with_booking_cannot_be_deleted(
    client: TestClient,
) -> None:
    meeting_type = setup(client)
    create_booking(client)

    response = client.delete(
        f"/hosts/me/meeting-types/{meeting_type['id']}"
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "meeting_type_in_use"
