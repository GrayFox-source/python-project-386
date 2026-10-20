from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from app.booking_page import get_now
from tests.helpers import TEST_EMAIL, TEST_PASSWORD

NOW = datetime(2026, 1, 5, 5, tzinfo=UTC)


def login(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200


def set_now(client: TestClient, value: datetime = NOW) -> None:
    client.app.dependency_overrides[get_now] = lambda: value


def create_availability(client: TestClient) -> dict[str, Any]:
    response = client.post(
        "/hosts/me/availabilities",
        json={
            "name": "Рабочие часы",
            "timezone": "Europe/Moscow",
            "weekly": {"1": [{"start": "09:00", "end": "11:00"}]},
            "overrides": [],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_meeting_type(
    client: TestClient,
    availability_id: str,
    **overrides: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Консультация",
        "duration_minutes": 30,
        "format": "online",
        "slug": "consultation",
        "availability_id": availability_id,
        "minimum_notice_minutes": 0,
        "slot_interval_minutes": 30,
    }
    payload.update(overrides)
    response = client.post("/hosts/me/meeting-types", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def setup_meeting_type(client: TestClient) -> dict[str, Any]:
    login(client)
    availability = create_availability(client)
    meeting_type = create_meeting_type(client, availability["id"])
    set_now(client)
    return meeting_type


def get_slots(
    client: TestClient,
    slug: str,
    *,
    from_date: str = "2026-01-05",
    to_date: str = "2026-01-05",
    timezone: str = "Europe/Moscow",
):
    return client.get(
        f"/book/{slug}/slots",
        params={"from": from_date, "to": to_date, "timezone": timezone},
    )


def test_public_meeting_type_is_served(client: TestClient) -> None:
    meeting_type = setup_meeting_type(client)

    response = client.get("/book/consultation")

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Консультация"
    assert body["slug"] == "consultation"
    assert body["scheduling_link"] == meeting_type["scheduling_link"]


def test_slots_are_grouped_by_display_date_with_utc_instants(
    client: TestClient,
) -> None:
    setup_meeting_type(client)

    response = get_slots(client, "consultation")

    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "Europe/Moscow"
    assert body["days"] == [
        {
            "date": "2026-01-05",
            "slots": [
                {
                    "start": "2026-01-05T06:00:00Z",
                    "end": "2026-01-05T06:30:00Z",
                },
                {
                    "start": "2026-01-05T06:30:00Z",
                    "end": "2026-01-05T07:00:00Z",
                },
                {
                    "start": "2026-01-05T07:00:00Z",
                    "end": "2026-01-05T07:30:00Z",
                },
                {
                    "start": "2026-01-05T07:30:00Z",
                    "end": "2026-01-05T08:00:00Z",
                },
            ],
        }
    ]


def test_slots_are_regrouped_in_requested_timezone(client: TestClient) -> None:
    setup_meeting_type(client)

    response = get_slots(client, "consultation", timezone="Asia/Tokyo")

    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "Asia/Tokyo"
    assert body["days"][0]["date"] == "2026-01-05"
    assert body["days"][0]["slots"][0] == {
        "start": "2026-01-05T06:00:00Z",
        "end": "2026-01-05T06:30:00Z",
    }


def test_empty_day_returns_empty_days(client: TestClient) -> None:
    setup_meeting_type(client)

    response = get_slots(
        client,
        "consultation",
        from_date="2026-01-06",
        to_date="2026-01-06",
    )

    assert response.status_code == 200
    assert response.json() == {"timezone": "Europe/Moscow", "days": []}


def test_slot_range_validation(client: TestClient) -> None:
    setup_meeting_type(client)

    reversed_range = get_slots(
        client,
        "consultation",
        from_date="2026-01-06",
        to_date="2026-01-05",
    )
    too_large = get_slots(
        client,
        "consultation",
        from_date="2026-01-05",
        to_date="2026-03-08",
    )
    maximum = get_slots(
        client,
        "consultation",
        from_date="2026-01-05",
        to_date="2026-03-07",
    )

    assert reversed_range.status_code == 422
    assert reversed_range.json()["detail"]["code"] == "range_too_large"
    assert too_large.status_code == 422
    assert too_large.json()["detail"]["code"] == "range_too_large"
    assert maximum.status_code == 200


def test_unknown_timezone_is_rejected(client: TestClient) -> None:
    setup_meeting_type(client)

    response = get_slots(client, "consultation", timezone="Mars/Olympus")

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_timezone"


def test_unknown_slug_returns_404(client: TestClient) -> None:
    setup_meeting_type(client)

    meeting_type = client.get("/book/unknown")
    slots = get_slots(client, "unknown")

    assert meeting_type.status_code == 404
    assert meeting_type.json()["detail"]["code"] == "meeting_type_not_found"
    assert slots.status_code == 404
    assert slots.json()["detail"]["code"] == "meeting_type_not_found"


def test_archived_meeting_type_returns_410(client: TestClient) -> None:
    meeting_type = setup_meeting_type(client)
    archived = client.post(
        f"/hosts/me/meeting-types/{meeting_type['id']}/archive"
    )
    assert archived.status_code == 200

    meeting_type_response = client.get("/book/consultation")
    slots_response = get_slots(client, "consultation")

    assert meeting_type_response.status_code == 410
    assert (
        meeting_type_response.json()["detail"]["code"]
        == "meeting_type_archived"
    )
    assert slots_response.status_code == 410
    assert slots_response.json()["detail"]["code"] == "meeting_type_archived"
