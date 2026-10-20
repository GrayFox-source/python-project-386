from datetime import UTC, date, datetime, time

from app.slots import MIDNIGHT, BusyBooking, generate_slots

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def slots_for(
    local_date: date,
    windows: list[tuple[time, time]],
    *,
    timezone: str = "UTC",
    display_timezone: str | None = None,
    duration_minutes: int = 30,
    slot_interval_minutes: int = 30,
    minimum_notice_minutes: int = 0,
    booking_horizon_days: int = 365,
    buffer_before_minutes: int = 0,
    buffer_after_minutes: int = 0,
    now: datetime = NOW,
    busy: list[BusyBooking] | None = None,
):
    return generate_slots(
        weekly={local_date.isoweekday(): windows},
        overrides={},
        availability_timezone=timezone,
        display_timezone=display_timezone or timezone,
        display_from=local_date,
        display_to=local_date,
        now=now,
        duration_minutes=duration_minutes,
        slot_interval_minutes=slot_interval_minutes,
        minimum_notice_minutes=minimum_notice_minutes,
        booking_horizon_days=booking_horizon_days,
        buffer_before_minutes=buffer_before_minutes,
        buffer_after_minutes=buffer_after_minutes,
        busy=busy or [],
    )


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def test_regular_day_uses_real_interval() -> None:
    slots = slots_for(
        date(2026, 1, 5),
        [(time(9), time(11))],
        duration_minutes=60,
        slot_interval_minutes=30,
    )

    assert [slot.start for slot in slots] == [
        utc(2026, 1, 5, 9),
        utc(2026, 1, 5, 9, 30),
        utc(2026, 1, 5, 10),
    ]
    assert slots[0].end == utc(2026, 1, 5, 10)


def test_split_shift_and_short_window() -> None:
    split = slots_for(
        date(2026, 1, 5),
        [(time(9), time(11)), (time(13), time(15))],
        slot_interval_minutes=60,
    )
    short = slots_for(date(2026, 1, 5), [(time(9), time(9, 25))])

    assert [slot.start for slot in split] == [
        utc(2026, 1, 5, 9),
        utc(2026, 1, 5, 10),
        utc(2026, 1, 5, 13),
        utc(2026, 1, 5, 14),
    ]
    assert short == []


def test_date_override_replaces_weekly_windows() -> None:
    local_date = date(2026, 1, 5)
    closed = generate_slots(
        weekly={1: [(time(9), time(10))]},
        overrides={local_date: None},
        availability_timezone="UTC",
        display_timezone="UTC",
        display_from=local_date,
        display_to=local_date,
        now=NOW,
        duration_minutes=30,
        slot_interval_minutes=30,
        minimum_notice_minutes=0,
        booking_horizon_days=365,
        buffer_before_minutes=0,
        buffer_after_minutes=0,
    )
    custom = generate_slots(
        weekly={1: [(time(9), time(10))]},
        overrides={local_date: [(time(12), time(13))]},
        availability_timezone="UTC",
        display_timezone="UTC",
        display_from=local_date,
        display_to=local_date,
        now=NOW,
        duration_minutes=30,
        slot_interval_minutes=30,
        minimum_notice_minutes=0,
        booking_horizon_days=365,
        buffer_before_minutes=0,
        buffer_after_minutes=0,
    )

    assert closed == []
    assert [slot.start for slot in custom] == [
        utc(2026, 1, 5, 12),
        utc(2026, 1, 5, 12, 30),
    ]


def test_minimum_notice_boundary_is_inclusive() -> None:
    slots = slots_for(
        date(2026, 1, 4),
        [(time(9), time(10))],
        now=utc(2026, 1, 4, 8),
        minimum_notice_minutes=60,
    )

    assert [slot.start for slot in slots] == [
        utc(2026, 1, 4, 9),
        utc(2026, 1, 4, 9, 30),
    ]


def test_booking_horizon_limits_availability_local_dates() -> None:
    slots = generate_slots(
        weekly={
            4: [(time(9), time(10))],
            5: [(time(9), time(10))],
            6: [(time(9), time(10))],
        },
        overrides={},
        availability_timezone="UTC",
        display_timezone="UTC",
        display_from=date(2026, 1, 1),
        display_to=date(2026, 1, 3),
        now=NOW,
        duration_minutes=30,
        slot_interval_minutes=30,
        minimum_notice_minutes=0,
        booking_horizon_days=1,
        buffer_before_minutes=0,
        buffer_after_minutes=0,
    )

    assert {slot.start.date() for slot in slots} == {
        date(2026, 1, 1),
        date(2026, 1, 2),
    }


def test_buffers_are_combined_symmetrically() -> None:
    slots = slots_for(
        date(2026, 1, 5),
        [(time(9), time(12))],
        buffer_before_minutes=0,
        buffer_after_minutes=10,
        busy=[
            BusyBooking(
                starts_at=utc(2026, 1, 5, 10),
                ends_at=utc(2026, 1, 5, 10, 30),
                buffer_before_minutes=5,
                buffer_after_minutes=15,
            )
        ],
    )

    assert [slot.start for slot in slots] == [
        utc(2026, 1, 5, 9),
        utc(2026, 1, 5, 11),
        utc(2026, 1, 5, 11, 30),
    ]


def test_spring_forward_gap_is_clamped() -> None:
    local_date = date(2026, 3, 8)

    inside_gap = slots_for(
        local_date,
        [(time(2), time(3))],
        timezone="America/New_York",
        duration_minutes=60,
        slot_interval_minutes=60,
    )
    partially_clamped = slots_for(
        local_date,
        [(time(2), time(4))],
        timezone="America/New_York",
        duration_minutes=60,
        slot_interval_minutes=60,
    )
    before_gap = slots_for(
        local_date,
        [(time(1), time(2))],
        timezone="America/New_York",
        duration_minutes=60,
        slot_interval_minutes=60,
    )

    assert inside_gap == []
    assert [(slot.start, slot.end) for slot in partially_clamped] == [
        (utc(2026, 3, 8, 7), utc(2026, 3, 8, 8))
    ]
    assert [(slot.start, slot.end) for slot in before_gap] == [
        (utc(2026, 3, 8, 6), utc(2026, 3, 8, 7))
    ]


def test_full_spring_forward_day_has_23_hours() -> None:
    slots = slots_for(
        date(2026, 3, 8),
        [(time(0), MIDNIGHT)],
        timezone="America/New_York",
        duration_minutes=60,
        slot_interval_minutes=60,
    )

    assert len(slots) == 23
    assert slots[0].start == utc(2026, 3, 8, 5)
    assert slots[-1].start == utc(2026, 3, 9, 3)


def test_fall_back_fold_keeps_both_occurrences() -> None:
    slots = slots_for(
        date(2026, 11, 1),
        [(time(0), time(3))],
        timezone="America/New_York",
        duration_minutes=30,
        slot_interval_minutes=30,
    )

    assert len(slots) == 8
    assert utc(2026, 11, 1, 5) in [slot.start for slot in slots]
    assert utc(2026, 11, 1, 6) in [slot.start for slot in slots]


def test_full_fall_back_day_has_25_hours() -> None:
    slots = slots_for(
        date(2026, 11, 1),
        [(time(0), MIDNIGHT)],
        timezone="America/New_York",
        duration_minutes=60,
        slot_interval_minutes=60,
    )

    assert len(slots) == 25
    assert slots[0].start == utc(2026, 11, 1, 4)
    assert slots[-1].start == utc(2026, 11, 2, 4)


def test_kolkata_and_tokyo_offsets() -> None:
    kolkata = slots_for(
        date(2026, 1, 5),
        [(time(9), time(10))],
        timezone="Asia/Kolkata",
        display_timezone="Asia/Kolkata",
    )
    tokyo = slots_for(
        date(2026, 1, 5),
        [(time(9), time(10))],
        timezone="Asia/Tokyo",
        display_timezone="Asia/Tokyo",
    )

    assert [slot.start for slot in kolkata] == [
        utc(2026, 1, 5, 3, 30),
        utc(2026, 1, 5, 4),
    ]
    assert [slot.start for slot in tokyo] == [
        utc(2026, 1, 5, 0),
        utc(2026, 1, 5, 0, 30),
    ]


def test_duplicate_instants_are_removed() -> None:
    slots = generate_slots(
        weekly={
            1: [(time(9), time(10)), (time(9), time(10))],
        },
        overrides={},
        availability_timezone="UTC",
        display_timezone="UTC",
        display_from=date(2026, 1, 5),
        display_to=date(2026, 1, 5),
        now=NOW,
        duration_minutes=30,
        slot_interval_minutes=30,
        minimum_notice_minutes=0,
        booking_horizon_days=365,
        buffer_before_minutes=0,
        buffer_after_minutes=0,
    )

    assert [slot.start for slot in slots] == [
        utc(2026, 1, 5, 9),
        utc(2026, 1, 5, 9, 30),
    ]
