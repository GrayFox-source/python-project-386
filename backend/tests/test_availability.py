from datetime import time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import AvailabilityRecord, AvailabilityRuleRecord, HostRecord
from tests.helpers import TEST_EMAIL, TEST_PASSWORD


def login(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200


def availability_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Рабочие часы",
        "timezone": "Europe/Moscow",
        "weekly": {
            "1": [
                {"start": "09:00", "end": "12:00"},
                {"start": "13:00", "end": "17:00"},
            ],
            "2": [{"start": "10:00", "end": "18:00"}],
        },
        "overrides": [
            {"date": "2026-11-03", "closed": True},
            {
                "date": "2026-11-04",
                "closed": False,
                "intervals": [{"start": "11:00", "end": "15:00"}],
            },
        ],
    }
    payload.update(overrides)
    return payload


def create_availability(
    client: TestClient, **overrides: Any
) -> dict[str, Any]:
    response = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(**overrides),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_availability_crud_round_trip(client: TestClient) -> None:
    login(client)

    created = create_availability(client, name="  Рабочие часы  ")
    availability_id = created["id"]

    assert created["name"] == "Рабочие часы"
    assert created["timezone"] == "Europe/Moscow"
    assert created["meeting_types_count"] == 0
    assert created["weekly"]["1"] == [
        {"start": "09:00", "end": "12:00"},
        {"start": "13:00", "end": "17:00"},
    ]
    assert created["weekly"]["7"] == []
    assert created["overrides"] == [
        {"date": "2026-11-03", "closed": True, "intervals": None},
        {
            "date": "2026-11-04",
            "closed": False,
            "intervals": [{"start": "11:00", "end": "15:00"}],
        },
    ]

    listed = client.get("/hosts/me/availabilities")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == availability_id

    fetched = client.get(f"/hosts/me/availabilities/{availability_id}")
    assert fetched.status_code == 200
    assert fetched.json() == created

    removed = client.delete(f"/hosts/me/availabilities/{availability_id}")
    assert removed.status_code == 204
    assert client.get(f"/hosts/me/availabilities/{availability_id}").status_code == 404
    assert client.get("/hosts/me/availabilities").json()["total"] == 0


def test_put_atomically_replaces_weekly_and_overrides(client: TestClient) -> None:
    login(client)
    created = create_availability(client)
    availability_id = created["id"]

    response = client.put(
        f"/hosts/me/availabilities/{availability_id}",
        json={
            "name": "Новое расписание",
            "timezone": "UTC",
            "weekly": {"3": [{"start": "08:05", "end": "09:00"}]},
            "overrides": [{"date": "2026-12-31", "closed": True}],
        },
    )

    assert response.status_code == 200
    replaced = response.json()
    assert replaced["name"] == "Новое расписание"
    assert replaced["timezone"] == "UTC"
    assert replaced["weekly"]["1"] == []
    assert replaced["weekly"]["3"] == [{"start": "08:05", "end": "09:00"}]
    assert len(replaced["overrides"]) == 1
    assert replaced["overrides"][0]["date"] == "2026-12-31"


def test_invalid_put_leaves_the_previous_schedule_untouched(
    client: TestClient,
) -> None:
    login(client)
    created = create_availability(client)
    availability_id = created["id"]

    response = client.put(
        f"/hosts/me/availabilities/{availability_id}",
        json=availability_payload(
            weekly={
                "1": [
                    {"start": "09:00", "end": "12:00"},
                    {"start": "11:00", "end": "13:00"},
                ]
            }
        ),
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["code"] == "overlapping_windows"
    current = client.get(f"/hosts/me/availabilities/{availability_id}").json()
    assert current == created


def test_availability_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/hosts/me/availabilities").status_code == 401
    assert client.post("/hosts/me/availabilities", json={}).status_code == 401
    assert client.get("/hosts/me/availabilities/missing").status_code == 401
    assert client.put("/hosts/me/availabilities/missing", json={}).status_code == 401
    assert client.delete("/hosts/me/availabilities/missing").status_code == 401


def test_name_is_trimmed_validated_and_unique_case_insensitively(
    client: TestClient,
) -> None:
    login(client)

    too_long = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(name="x" * 101),
    )
    assert too_long.status_code == 422
    assert too_long.json()["detail"][0]["loc"] == ["body", "name"]

    blank = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(name="   "),
    )
    assert blank.status_code == 422

    first = create_availability(client, name="Focus")
    duplicate = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(name="  focus "),
    )
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"]["code"] == "duplicate_availability_name"

    create_availability(client, name="Фокус")
    cyrillic_duplicate = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(name="фокус"),
    )
    assert cyrillic_duplicate.status_code == 422
    assert (
        cyrillic_duplicate.json()["detail"]["code"]
        == "duplicate_availability_name"
    )

    second = create_availability(client, name="Other")
    renamed = client.put(
        f"/hosts/me/availabilities/{second['id']}",
        json=availability_payload(name="FOCUS"),
    )
    assert renamed.status_code == 422

    unchanged = client.put(
        f"/hosts/me/availabilities/{first['id']}",
        json=availability_payload(name=" Focus "),
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["name"] == "Focus"


def test_invalid_timezone_is_rejected(client: TestClient) -> None:
    login(client)

    response = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(timezone="Mars/Olympus"),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_timezone"


@pytest.mark.parametrize(
    ("weekly", "expected_code"),
    [
        (
            {
                "1": [
                    {"start": "09:00", "end": "12:00"},
                    {"start": "12:00", "end": "13:00"},
                ]
            },
            None,
        ),
        (
            {
                "1": [
                    {"start": "09:00", "end": "10:00"},
                    {"start": "09:00", "end": "10:00"},
                ]
            },
            "overlapping_windows",
        ),
        (
            {
                "1": [
                    {"start": "09:00", "end": "12:00"},
                    {"start": "11:00", "end": "13:00"},
                ]
            },
            "overlapping_windows",
        ),
    ],
)
def test_weekly_window_overlap_rules(
    client: TestClient,
    weekly: dict[str, list[dict[str, str]]],
    expected_code: str | None,
) -> None:
    login(client)

    response = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(weekly=weekly),
    )

    if expected_code is None:
        assert response.status_code == 200
        return

    assert response.status_code == 422
    assert response.json()["detail"][0]["code"] == expected_code


def test_window_grid_length_and_count_are_validated(client: TestClient) -> None:
    login(client)

    off_grid = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={"1": [{"start": "09:07", "end": "10:00"}]}
        ),
    )
    assert off_grid.status_code == 422

    zero_length = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={"1": [{"start": "09:00", "end": "09:00"}]}
        ),
    )
    assert zero_length.status_code == 422

    too_many = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={
                "1": [
                    {"start": f"{hour:02d}:00", "end": f"{hour:02d}:05"}
                    for hour in range(21)
                ]
            }
        ),
    )
    assert too_many.status_code == 422

    midnight_end = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={"1": [{"start": "23:00", "end": "24:00"}]}
        ),
    )
    assert midnight_end.status_code == 200
    assert midnight_end.json()["weekly"]["1"] == [
        {"start": "23:00", "end": "24:00"}
    ]

    midnight_start = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={"1": [{"start": "24:00", "end": "24:00"}]}
        ),
    )
    assert midnight_start.status_code == 422

    invalid_day = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            weekly={"8": [{"start": "09:00", "end": "10:00"}]}
        ),
    )
    assert invalid_day.status_code == 422


def test_override_validation(client: TestClient) -> None:
    login(client)

    duplicate = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            overrides=[
                {"date": "2026-11-03", "closed": True},
                {"date": "2026-11-03", "closed": True},
            ]
        ),
    )
    assert duplicate.status_code == 422
    assert duplicate.json()["detail"]["code"] == "duplicate_override_date"

    closed_with_intervals = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            overrides=[
                {
                    "date": "2026-11-03",
                    "closed": True,
                    "intervals": [{"start": "09:00", "end": "10:00"}],
                }
            ]
        ),
    )
    assert closed_with_intervals.status_code == 422
    assert closed_with_intervals.json()["detail"]["code"] == "invalid_override"

    open_without_intervals = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            overrides=[{"date": "2026-11-03", "closed": False}]
        ),
    )
    assert open_without_intervals.status_code == 422
    assert open_without_intervals.json()["detail"]["code"] == "invalid_override"

    overlapping = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(
            overrides=[
                {
                    "date": "2026-11-03",
                    "closed": False,
                    "intervals": [
                        {"start": "09:00", "end": "12:00"},
                        {"start": "11:00", "end": "13:00"},
                    ],
                }
            ]
        ),
    )
    assert overlapping.status_code == 422
    assert overlapping.json()["detail"][0]["code"] == "overlapping_windows"
    assert overlapping.json()["detail"][0]["loc"][:2] == ["body", "overrides"]


def test_empty_availability_is_valid(client: TestClient) -> None:
    login(client)

    response = client.post(
        "/hosts/me/availabilities",
        json=availability_payload(weekly={}, overrides=[]),
    )

    assert response.status_code == 200
    assert response.json()["weekly"] == {str(day): [] for day in range(1, 8)}
    assert response.json()["overrides"] == []


def test_patch_is_not_supported(client: TestClient) -> None:
    login(client)
    created = create_availability(client)

    response = client.patch(
        f"/hosts/me/availabilities/{created['id']}",
        json={"name": "Patched"},
    )

    assert response.status_code == 405


def test_delete_cascades_availability_rules(client: TestClient, app) -> None:
    login(client)
    created = create_availability(client)

    with app.state.session_factory() as session:
        count = session.scalar(
            select(func.count()).select_from(AvailabilityRuleRecord)
        )
        assert count and count > 0

    assert (
        client.delete(f"/hosts/me/availabilities/{created['id']}").status_code
        == 204
    )

    with app.state.session_factory() as session:
        count = session.scalar(
            select(func.count()).select_from(AvailabilityRuleRecord)
        )
        assert count == 0


def test_delete_in_use_availability_returns_conflict(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    created = create_availability(client)

    monkeypatch.setattr(
        "app.availability.meeting_types_count",
        lambda _session, _availability_id: 1,
    )
    response = client.delete(f"/hosts/me/availabilities/{created['id']}")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "availability_in_use"
    assert client.get(f"/hosts/me/availabilities/{created['id']}").status_code == 200


def test_database_rejects_invalid_rule_shapes(app) -> None:
    with app.state.session_factory() as session:
        host = session.scalar(select(HostRecord))
        assert host is not None
        availability = AvailabilityRecord(
            host_id=host.id,
            name="Broken",
            name_key="broken",
            timezone="UTC",
        )
        session.add(availability)
        session.flush()

        session.add(
            AvailabilityRuleRecord(
                availability_id=availability.id,
                kind="weekly",
                day_of_week=8,
                start_time=time(9, 0),
                end_time=time(10, 0),
            )
        )

        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()
