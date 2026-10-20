from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import TEST_EMAIL, TEST_PASSWORD


def login(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200


def create_availability(
    client: TestClient,
    name: str = "Рабочие часы",
) -> dict[str, Any]:
    response = client.post(
        "/hosts/me/availabilities",
        json={
            "name": name,
            "timezone": "Europe/Moscow",
            "weekly": {"1": [{"start": "09:00", "end": "17:00"}]},
            "overrides": [],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def meeting_type_payload(
    availability_id: str,
    **overrides: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Discovery Call",
        "duration_minutes": 30,
        "format": "online",
        "availability_id": availability_id,
    }
    payload.update(overrides)
    return payload


def create_meeting_type(
    client: TestClient,
    availability_id: str,
    **overrides: Any,
) -> dict[str, Any]:
    response = client.post(
        "/hosts/me/meeting-types",
        json=meeting_type_payload(availability_id, **overrides),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_meeting_type_crud_round_trip(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)

    created = create_meeting_type(
        client,
        availability["id"],
        title="  Discovery Call  ",
        description="  A short intro  ",
        location="  https://meet.example.com/room  ",
    )

    assert created["title"] == "Discovery Call"
    assert created["description"] == "A short intro"
    assert created["duration_minutes"] == 30
    assert created["format"] == "online"
    assert created["location"] == "https://meet.example.com/room"
    assert created["slug"] == "discovery-call"
    assert created["availability_id"] == availability["id"]
    assert created["status"] == "active"
    assert created["buffer_before_minutes"] == 0
    assert created["buffer_after_minutes"] == 0
    assert created["minimum_notice_minutes"] == 120
    assert created["booking_horizon_days"] == 60
    assert created["slot_interval_minutes"] == 30
    assert created["scheduling_link"] == ("http://localhost:5173/book/discovery-call")

    listed = client.get("/hosts/me/meeting-types")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0] == created

    fetched = client.get(f"/hosts/me/meeting-types/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created

    replaced = client.put(
        f"/hosts/me/meeting-types/{created['id']}",
        json=meeting_type_payload(
            availability["id"],
            title="Strategy Session",
            description="New description",
            duration_minutes=60,
            format="offline",
            location="Office 42",
            slug="strategy-session",
            buffer_before_minutes=10,
            buffer_after_minutes=15,
            minimum_notice_minutes=30,
            booking_horizon_days=90,
            slot_interval_minutes=20,
        ),
    )
    assert replaced.status_code == 200
    updated = replaced.json()
    assert updated["title"] == "Strategy Session"
    assert updated["description"] == "New description"
    assert updated["duration_minutes"] == 60
    assert updated["format"] == "offline"
    assert updated["location"] == "Office 42"
    assert updated["slug"] == "strategy-session"
    assert updated["status"] == "active"
    assert updated["buffer_before_minutes"] == 10
    assert updated["buffer_after_minutes"] == 15
    assert updated["minimum_notice_minutes"] == 30
    assert updated["booking_horizon_days"] == 90
    assert updated["slot_interval_minutes"] == 20
    assert updated["scheduling_link"].endswith("/book/strategy-session")

    assert client.delete(f"/hosts/me/meeting-types/{created['id']}").status_code == 204
    assert client.get("/hosts/me/meeting-types").json()["total"] == 0
    assert (
        client.get(f"/hosts/me/availabilities/{availability['id']}").status_code == 200
    )


def test_optional_text_is_trimmed_and_blank_becomes_null(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)

    created = create_meeting_type(
        client,
        availability["id"],
        description="   ",
        location="\t ",
    )

    assert created["description"] is None
    assert created["location"] is None


def test_slug_is_generated_from_cyrillic_title_with_collision_suffix(
    client: TestClient,
) -> None:
    login(client)
    availability = create_availability(client)

    first = create_meeting_type(
        client, availability["id"], title="Стратегическая встреча"
    )
    second = create_meeting_type(
        client, availability["id"], title="Стратегическая встреча"
    )

    assert first["slug"] == "strategicheskaya-vstrecha"
    assert second["slug"] == "strategicheskaya-vstrecha-2"
    assert first["scheduling_link"].endswith(f"/book/{first['slug']}")
    assert second["scheduling_link"].endswith(f"/book/{second['slug']}")


def test_manual_slug_conflict_and_invalid_slug(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)
    create_meeting_type(client, availability["id"], slug="custom-slug")

    conflict = client.post(
        "/hosts/me/meeting-types",
        json=meeting_type_payload(availability["id"], slug="custom-slug"),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "slug_taken"

    for slug in ["Upper-Case", "two--hyphens", "trailing-", "under_score", "x" * 65]:
        response = client.post(
            "/hosts/me/meeting-types",
            json=meeting_type_payload(availability["id"], slug=slug),
        )
        assert response.status_code == 422, slug
        assert response.json()["detail"][0]["loc"] == ["body", "slug"]


def test_slug_change_frees_old_slug_and_omitted_slug_is_kept(
    client: TestClient,
) -> None:
    login(client)
    availability = create_availability(client)
    created = create_meeting_type(client, availability["id"], slug="old-slug")

    renamed = client.put(
        f"/hosts/me/meeting-types/{created['id']}",
        json=meeting_type_payload(availability["id"], title="Renamed"),
    )
    assert renamed.status_code == 200
    assert renamed.json()["slug"] == "old-slug"

    renamed = client.put(
        f"/hosts/me/meeting-types/{created['id']}",
        json=meeting_type_payload(availability["id"], title="Renamed", slug="new-slug"),
    )
    assert renamed.status_code == 200
    assert renamed.json()["slug"] == "new-slug"

    reused = create_meeting_type(client, availability["id"], slug="old-slug")
    assert reused["slug"] == "old-slug"


def test_archive_unarchive_keep_slug_and_reserve_it(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)
    created = create_meeting_type(client, availability["id"], slug="reserved")

    archived = client.post(f"/hosts/me/meeting-types/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert archived.json()["slug"] == "reserved"
    assert archived.json()["scheduling_link"] == created["scheduling_link"]

    conflict = client.post(
        "/hosts/me/meeting-types",
        json=meeting_type_payload(availability["id"], slug="reserved"),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "slug_taken"

    availability_after = client.get(
        f"/hosts/me/availabilities/{availability['id']}"
    ).json()
    assert availability_after["meeting_types_count"] == 1
    assert (
        client.delete(f"/hosts/me/availabilities/{availability['id']}").status_code
        == 409
    )

    unarchived = client.post(f"/hosts/me/meeting-types/{created['id']}/unarchive")
    assert unarchived.status_code == 200
    assert unarchived.json()["status"] == "active"
    assert unarchived.json()["slug"] == "reserved"
    assert unarchived.json()["scheduling_link"] == created["scheduling_link"]


def test_replace_does_not_change_archived_status(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)
    created = create_meeting_type(client, availability["id"])
    client.post(f"/hosts/me/meeting-types/{created['id']}/archive")

    replaced = client.put(
        f"/hosts/me/meeting-types/{created['id']}",
        json=meeting_type_payload(availability["id"], title="Updated title"),
    )

    assert replaced.status_code == 200
    assert replaced.json()["status"] == "archived"


def test_delete_meeting_type_frees_slug_and_keeps_availability(
    client: TestClient,
) -> None:
    login(client)
    availability = create_availability(client)
    created = create_meeting_type(client, availability["id"], slug="temporary")

    assert client.delete(f"/hosts/me/meeting-types/{created['id']}").status_code == 204
    assert client.get(f"/hosts/me/meeting-types/{created['id']}").status_code == 404

    reused = create_meeting_type(client, availability["id"], slug="temporary")
    assert reused["slug"] == "temporary"
    assert (
        client.get(f"/hosts/me/availabilities/{availability['id']}").status_code == 200
    )


def test_meeting_type_requires_existing_availability(client: TestClient) -> None:
    login(client)

    response = client.post(
        "/hosts/me/meeting-types",
        json=meeting_type_payload("missing-availability"),
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "availability_not_found"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("title", "   "),
        ("title", "x" * 121),
        ("description", "x" * 2001),
        ("location", "x" * 501),
        ("duration_minutes", 4),
        ("duration_minutes", 481),
        ("buffer_before_minutes", -1),
        ("buffer_before_minutes", 121),
        ("buffer_after_minutes", -1),
        ("buffer_after_minutes", 121),
        ("minimum_notice_minutes", -1),
        ("minimum_notice_minutes", 10081),
        ("booking_horizon_days", 0),
        ("booking_horizon_days", 366),
        ("slot_interval_minutes", 4),
        ("slot_interval_minutes", 481),
        ("format", "phone"),
    ],
)
def test_meeting_type_validation(
    client: TestClient,
    field: str,
    value: object,
) -> None:
    login(client)
    availability = create_availability(client)

    response = client.post(
        "/hosts/me/meeting-types",
        json=meeting_type_payload(availability["id"], **{field: value}),
    )

    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    if isinstance(detail, list):
        assert detail[0]["loc"][1] == field


def test_list_is_newest_first(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)
    first = create_meeting_type(client, availability["id"], title="First")
    second = create_meeting_type(client, availability["id"], title="Second")

    items = client.get("/hosts/me/meeting-types").json()["items"]

    assert [item["id"] for item in items] == [second["id"], first["id"]]


def test_meeting_type_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/hosts/me/meeting-types").status_code == 401
    assert client.post("/hosts/me/meeting-types", json={}).status_code == 401
    assert client.get("/hosts/me/meeting-types/missing").status_code == 401
    assert client.put("/hosts/me/meeting-types/missing", json={}).status_code == 401
    assert client.delete("/hosts/me/meeting-types/missing").status_code == 401
    assert client.post("/hosts/me/meeting-types/missing/archive").status_code == 401
    assert client.post("/hosts/me/meeting-types/missing/unarchive").status_code == 401


def test_patch_is_not_supported(client: TestClient) -> None:
    login(client)
    availability = create_availability(client)
    created = create_meeting_type(client, availability["id"])

    response = client.patch(
        f"/hosts/me/meeting-types/{created['id']}",
        json={"title": "Patched"},
    )

    assert response.status_code == 405
