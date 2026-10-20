from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

MIDNIGHT = time(23, 59, 59, 999999)


@dataclass(frozen=True)
class BusyBooking:
    starts_at: datetime
    ends_at: datetime
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0


@dataclass(frozen=True)
class Slot:
    start: datetime
    end: datetime


def _is_gap(local: datetime, zone: ZoneInfo) -> bool:
    round_trip = local.astimezone(UTC).astimezone(zone)
    return round_trip.replace(tzinfo=None) != local.replace(tzinfo=None)


def _transition_instant(zone: ZoneInfo, local_date: date) -> datetime | None:
    start = datetime.combine(local_date, time(0), tzinfo=zone).astimezone(UTC)
    end = datetime.combine(
        local_date + timedelta(days=1), time(0), tzinfo=zone
    ).astimezone(UTC)
    if start.astimezone(zone).utcoffset() == end.astimezone(zone).utcoffset():
        return None

    low = int(min(start, end).timestamp())
    high = int(max(start, end).timestamp())
    initial_offset = datetime.fromtimestamp(low, UTC).astimezone(zone).utcoffset()
    while low < high:
        middle = (low + high) // 2
        offset = (
            datetime.fromtimestamp(middle, UTC).astimezone(zone).utcoffset()
        )
        if offset == initial_offset:
            low = middle + 1
        else:
            high = middle
    return datetime.fromtimestamp(low, UTC)


def _localize(zone: ZoneInfo, local_date: date, value: time) -> datetime:
    local = datetime.combine(local_date, value, tzinfo=zone)
    if _is_gap(local, zone):
        transition = _transition_instant(zone, local_date)
        if transition is not None:
            return transition
    return local.astimezone(UTC)


def _window_instants(
    zone: ZoneInfo,
    local_date: date,
    start: time,
    end: time,
) -> tuple[datetime, datetime]:
    if end == MIDNIGHT:
        end_date = local_date + timedelta(days=1)
        end_time = time(0)
    else:
        end_date = local_date
        end_time = end
    return (
        _localize(zone, local_date, start),
        _localize(zone, end_date, end_time),
    )


def _busy_ranges(
    busy: Sequence[BusyBooking],
    buffer_before_minutes: int,
    buffer_after_minutes: int,
) -> list[tuple[datetime, datetime]]:
    return [
        (
            booking.starts_at
            - timedelta(
                minutes=booking.buffer_before_minutes + buffer_after_minutes
            ),
            booking.ends_at
            + timedelta(
                minutes=booking.buffer_after_minutes + buffer_before_minutes
            ),
        )
        for booking in busy
    ]


def generate_slots(
    *,
    weekly: dict[int, list[tuple[time, time]]],
    overrides: dict[date, list[tuple[time, time]] | None],
    availability_timezone: str,
    display_timezone: str,
    display_from: date,
    display_to: date,
    now: datetime,
    duration_minutes: int,
    slot_interval_minutes: int,
    minimum_notice_minutes: int,
    booking_horizon_days: int,
    buffer_before_minutes: int,
    buffer_after_minutes: int,
    busy: Sequence[BusyBooking] = (),
) -> list[Slot]:
    availability_zone = ZoneInfo(availability_timezone)
    display_zone = ZoneInfo(display_timezone)
    duration = timedelta(minutes=duration_minutes)
    interval = timedelta(minutes=slot_interval_minutes)
    earliest_start = now + timedelta(minutes=minimum_notice_minutes)
    today = now.astimezone(availability_zone).date()
    last_date = today + timedelta(days=booking_horizon_days)
    busy_ranges = _busy_ranges(
        busy,
        buffer_before_minutes,
        buffer_after_minutes,
    )

    slots: dict[datetime, Slot] = {}
    current_date = display_from - timedelta(days=1)
    expansion_end = display_to + timedelta(days=1)

    while current_date <= expansion_end:
        if current_date in overrides:
            windows = overrides[current_date]
            if windows is None:
                current_date += timedelta(days=1)
                continue
        else:
            windows = weekly.get(current_date.isoweekday(), [])

        if today <= current_date <= last_date:
            for start_time, end_time in windows:
                window_start, window_end = _window_instants(
                    availability_zone,
                    current_date,
                    start_time,
                    end_time,
                )
                if window_start >= window_end:
                    continue

                slot_start = window_start
                while slot_start + duration <= window_end:
                    slot_end = slot_start + duration
                    display_date = slot_start.astimezone(display_zone).date()
                    occupied = any(
                        slot_start < busy_end and slot_end > busy_start
                        for busy_start, busy_end in busy_ranges
                    )
                    if (
                        slot_start >= earliest_start
                        and not occupied
                        and display_from <= display_date <= display_to
                    ):
                        slots.setdefault(slot_start, Slot(slot_start, slot_end))
                    slot_start += interval

        current_date += timedelta(days=1)

    return sorted(slots.values(), key=lambda slot: slot.start)
