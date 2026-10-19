# Research: timezones and DST in the booking system

AFK research for wayfinder ticket #4. Goal: understand how time zones and daylight
saving time (DST) must be modelled, stored, and displayed so the future Slot
generation (#10), data model (#11), and API contract (#12) tickets rest on
verified facts rather than assumptions.

This document does **not** choose an implementation. It records what the
standards, the Python/JS runtimes, and two production schedulers (Cal.com,
Calendly) do, and ends with concrete recommendations for our spec.

## Context

Three distinct "times" are easy to confuse: an **instant** (a point on the UTC
timeline, unambiguous), a **wall time** (`2026-03-08 02:30` on a clock, no zone,
ambiguous), and a **zoned wall time** (wall time + IANA zone such as
`America/New_York` — usually one instant, but zero or two during a DST transition).

In our domain the relevant places are:

- A **Host**'s **Availability** is a recurring weekly pattern (e.g. Mon–Fri 09:00–17:00)
  plus date overrides.
- A **Meeting Type** has a duration; **Slots** are the concrete bookable start times
  derived from Availability.
- A **Booking** is created when a **Guest** picks a Slot.
- A **Guest** may be in a different time zone from the Host and expects the
  **Booking Page** to show Slots in their local time.

The hard cases all live at the boundary between wall time and instant, and they only
appear on the two DST transition days per year per zone.

## Storage model

The consensus across standards and production schedulers is a **split model**:
store instants for committed points in time, and store wall-clock rules plus an IANA
zone for recurrence.

### Committed times (Bookings, Slot start/end at the API boundary)

Store the **instant**, i.e. a UTC timestamp.

- Cal.com's Prisma schema stores `Booking.startTime` / `Booking.endTime` as
  `DateTime` (a point in time), while the Host's `Schedule` carries a `timeZone`
  string. `Availability` rows instead use `@db.Time` for `startTime`/`endTime` plus a
  day, i.e. wall-clock time. See
  https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma
- Cal.com's v2 API requires booking `start` to be UTC: "if GMT+2 in Rome and meeting
  starts at 11, UTC should be 09:00". See
  https://cal.com/docs/api-reference/v2/bookings/create-a-booking
- RFC 3339 / ISO 8601 timestamps with `Z` or an explicit offset are the wire form.
  RFC 9557 (IXDTF) extends that form with an optional IANA annotation, e.g.
  `2026-03-08T03:00:00-04:00[America/New_York]`, precisely so a timestamp can travel
  with its zone. See https://www.rfc-editor.org/rfc/rfc9557.html

### Recurring Availability

Store the rule as **local wall time + IANA zone**, and expand it per calendar date.

- Cal.com: `Schedule.timeZone` + `Availability.startTime`/`endTime` (`@db.Time`) +
  `days` (see schema link above). The per-date expansion lives in
  `processWorkingHours` in
  https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts,
  which localises each wall time with the zone's UTC offset for that date and has an
  explicit branch for the DST day so a window "always has to be start of the day
  (midnight) even when DST changes".
- This is what makes 09:00 stay 09:00 local for the Host all year.

### Why not store numeric offsets or abbreviations

An offset (`+01:00`) and an abbreviation (`CET`, `EST`) are not time zones: the same
abbreviation maps to different offsets in different regions, and an offset carries no
rule for other dates. The IANA database documents both problems explicitly; see
https://www.iana.org/time-zones/theory and
https://www.iana.org/time-zones. Use IANA identifiers (`Europe/Berlin`), never
`+01:00`/`CET`, as the stored zone.

### Rule changes are expected

IANA publishes updates whenever a government changes its rules, and the database
explicitly notes that future transitions can change. See
https://www.iana.org/time-zones/theory. Consequence: a committed Booking must keep its
instant fixed; a recurring Availability must be re-expanded from `zone + wall time`
as rules update (so future occurrences can move). Store the instant as authoritative
for Bookings, and store the original zone plus the offset at booking time as display
metadata (see "Recommendations").

## DST edge cases

There are exactly two pathological wall times per transition in a zone.

### Spring forward — nonexistent (gap) local times

Clocks jump forward; the skipped wall-clock range (e.g. 02:00–03:00 in
`America/New_York`) does not exist.

- PEP 495 defines how Python represents this: a wall time in the gap gets the
  pre-transition offset with `fold=0` and the post-transition offset with `fold=1`.
  See https://peps.python.org/pep-0495/ and
  https://docs.python.org/3/library/datetime.html#datetime.datetime.fold
- `ZoneInfo` (stdlib since Python 3.9) does **not** raise on such a datetime; it
  returns a `ZoneInfo`-aware datetime whose `utcoffset()` depends on `fold`. See
  https://docs.python.org/3/library/zoneinfo.html
- Detection from offsets, per PEP 495: for a naive wall time with zone `z`, build
  `a = wall.replace(tzinfo=z, fold=0)` and `b = wall.replace(tzinfo=z, fold=1)`.
  If offsets are equal, the time is unambiguous. If `a.utcoffset() > b.utcoffset()`
  the time is **ambiguous** (fall-back). If `a.utcoffset() < b.utcoffset()` the time
  is in the **gap** (nonexistent).
- ECMAScript's forward-looking API names the same idea: Temporal's `disambiguation`
  option is `"compatible" | "earlier" | "later" | "reject"`, where `"compatible"`
  skips forward for a gap and picks the earlier instant for a fold. See
  https://tc39.es/proposal-temporal/docs/timezone.html

### Fall back — ambiguous local times

Clocks go back; the repeated wall-clock range occurs twice, at two different offsets.
For those wall times, two instants are valid and they are not interchangeable.
Python's same-`tzinfo` comparisons ignore `fold`, and same-`tzinfo` subtraction is
wall-clock arithmetic (no DST adjustment), so the two instants can compare equal as
datetimes while being distinct in time. See the comparison/subtraction notes in
https://docs.python.org/3/library/datetime.html#datetime.datetime.

### Pitfalls that follow directly from the docs

- `datetime.replace(tzinfo=zone)` **attaches** a zone; it does not convert. Only
  `astimezone(zone)` converts an instant between zones. See
  https://docs.python.org/3/library/datetime.html#datetime.datetime.astimezone
- Adding a `timedelta` to an aware datetime performs **wall-clock** arithmetic ("no
  time zone adjustments are done even if the input is an aware object"), so
  `09:00 + 1 day` stays `09:00` local across a transition. To add an exact duration,
  convert to UTC first, add, then convert back. See
  https://docs.python.org/3/library/datetime.html#datetime.datetime.
- JavaScript's `Date` is an instant only; its getters return fields in the runtime's
  local zone, not an arbitrary one. To read an instant in a specific zone you must use
  `Intl.DateTimeFormat` with a `timeZone` option, which is standardised in ECMA-402
  (`DateTimeFormat` objects). See https://tc39.es/ecma402/#datetimeformat-objects and
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
- `Intl.DateTimeFormat` only formats instants; it does not resolve a bare wall time to
  an instant, so disambiguation on the client needs Temporal or a dedicated library.
- Python's `zoneinfo` uses the system tz database where present, otherwise the
  `tzdata` PyPI package; containers and Windows builds should add `tzdata`
  explicitly. See https://docs.python.org/3/library/zoneinfo.html

### Consequence for Slot generation

Because a DST day is 23 or 25 real hours, "iterate 30-minute steps on the wall clock"
and "iterate 30-minute steps in real time" give different Slot sets on transition
days. Generating Slots by advancing the **instant** from the localised window start,
and converting each instant back to local time for display, is the model that
naturally yields no phantom `02:xx` Slots on spring-forward and both repeated `01:xx`
Slots on fall-back. Window endpoints that fall inside a gap have to be resolved
explicitly (clamp inward to the transition) or the window silently gains/loses an
hour.

## Libraries

### Python (backend, Python 3.14)

- **`zoneinfo`** (stdlib): IANA support, `ZoneInfo("Europe/Berlin")`, keys are
  canonical area/location names. No third-party dependency needed for reading zones.
  See https://docs.python.org/3/library/zoneinfo.html
- **`tzdata`** (PyPI): ships the IANA database for platforms without a system copy.
  Recommended as an explicit dependency for reproducible containers.
- **`datetime`** (stdlib): aware/naive semantics, `fold`, `astimezone`. See
  https://docs.python.org/3/library/datetime.html
- **PEP 495**: the normative description of `fold` and the gap/fold offset rule. See
  https://peps.python.org/pep-0495/
- No need for `pytz` on 3.14; prefer stdlib `zoneinfo`.

### JavaScript (frontend, React 19 + Vite)

- **`Intl`** (stdlib): `Intl.DateTimeFormat` with `timeZone` renders an instant in a
  target zone; `Intl.DateTimeFormat().resolvedOptions().timeZone` gives the runtime
  zone (the natural default for a Guest). See the MDN and ECMA-402 links above.
- **Temporal** is the standards-track successor (`Temporal.Instant` = exact time,
  `Temporal.PlainDateTime` = wall clock, `Temporal.ZonedDateTime` = both, with the
  `disambiguation` and `offset` options). It is the right long-term client model; the
  spec and reference live at https://tc39.es/proposal-temporal/docs/ and
  https://tc39.es/proposal-temporal/docs/timezone.html. Runtime availability should be
  checked before depending on it.
- If Temporal is not available, keep formatting on `Intl` and have the server return
  instants only, so the client never resolves wall time to instant. Avoid hand-rolled
  offset math.

### Production precedent (Cal.com / Calendly)

- Cal.com stores IANA identifiers everywhere (API docs: "every timezone is an IANA
  identifier", `GET /v2/timezones` returns city + identifier + aliases):
  https://cal.com/docs/api-reference/v2/timezones
- Slot fetch takes a display zone: `GET /v2/slots` with `start`, `end`,
  `timeZone=Europe/Rome`, and returns Slots rendered in that zone with offsets. See
  https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
- Cal.com's booker time zone precedence is `storeTimezone ?? bookerUserPreferredTimezone`
  (a `cal.tz` query parameter lands in the store), and a schedule can pin the zone:
  https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/Booker/utils/getBookerTimezone.ts
  and
  https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/Booker/hooks/useStableTimezone.ts
- Cal.com's own test rule is to run timezone-sensitive tests with `TZ=UTC`:
  https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/agents/rules/testing-timezone.md

## Guest timezone display

Both products converge on the same policy: the Guest sees the Booking Page in their
own zone, chosen automatically, changeable by the Guest, while the underlying booking
is an instant.

- Calendly auto-detects the invitee's time zone, shows availability in the Guest's
  local time, lets the Guest change it from a dropdown, and adjusts for DST; the Host
  can instead lock an event type to a single time zone. See
  https://calendly.com/help/time-zones-overview
- Calendly's API exposes an invitee `timezone` field on the invitee resource. See
  https://developer.calendly.com/api-docs/8305c0ccfac70-get-event-invitee
- Cal.com: the Guest zone is used to **render** Slots (the `timeZone` query parameter),
  while the Booking is created from a UTC `start` plus an `attendee.timeZone`. See the
  slots and booking-create docs linked above.

The practical reading: the Guest's zone is a **display preference attached to the
Booking**, not part of the Booking's identity. The identity is the instant.

## Recommendations for our spec

Concrete defaults to carry into #10 (Slot generation), #11 (data model), and #12 (API
contract). These are recommendations, not decisions; the data-model and API tickets
should confirm them.

1. **Two storage shapes.** Commit instants (UTC) for `Booking.start`/`end` and for
   generated Slots at the API boundary. Store recurring `Availability` as
   `day_of_week + start_time + end_time` (wall clock) plus an IANA `zone` on the Host
   (or per Availability). A date override likewise stores local times plus an optional
   zone, not an instant.
2. **IANA zones only.** Validate every zone string with `ZoneInfo` on the server and
   reject unknown keys with 422. Never accept or persist `+02:00`, `CET`, or `EST` as
   a zone. Use display names (CLDR) in the UI, not the raw key.
3. **Backend generates Slots; the client only formats.** Slot generation uses the
   Host's zone. The Guest zone is a display parameter. This keeps DST resolution in
   one place and avoids client/server disagreement.
4. **Expand Availability in local time, iterate Slots in real time.** Localise the
   window's start and end for each date using the Host zone; advance the instant by
   the Meeting Type duration; convert each instant back to the display zone. Gap
   handling: clamp a start falling in a gap forward to the transition instant, and an
   end falling in a gap backward to the transition instant (so a fully-skipped window
   yields zero Slots). Ambiguous boundaries: pick the earlier occurrence consistently
   and let the instant-iteration produce both repeated hours when the window spans
   them.
5. **Wire format.** API timestamps are RFC 3339 UTC with `Z`. Return a `timeZone`
   field for the requested display zone; optionally include an offset-bearing
   `localStart`/`localEnd` (RFC 9557-style annotation is acceptable but not required).
   Accept only timestamps with `Z` or an explicit offset on input; reject date-only and
   naive date-times so the server never has to guess.
6. **Booking stores display metadata.** Persist `timezone` (IANA) and
   `offset_at_booking` alongside the instant, so notifications and "as booked" views
   stay stable if rules change. Reconstruct the instant from the stored instant, never
   from the stored wall time.
7. **Uniqueness on instants.** Double-booking protection (unique constraint or
   exclusion) compares instants, not local strings. On fall-back the same wall label
   is two instants and must remain distinguishable in the UI (offset / zone shown).
8. **Date grouping is a display concern.** Accept a range as UTC instants and a
   `timeZone`; group Slots by date *in that zone*. When a caller passes a local date
   range, convert it server-side and widen by ±1 day to cover offsets.
9. **Pin the tz database.** Add `tzdata` to the backend dependencies for reproducible
   containers, and note the update cadence. The browser's ICU data may differ from the
   server's; that is another reason the server owns Slot generation.
10. **Test with fixed transitions and `TZ=UTC`.** Cover at least: spring-forward gap
    (`America/New_York` 2026-03-08 02:30), fall-back fold (2026-11-01 01:30, `fold=0`
    vs `fold=1`), a 30-minute-offset zone (`Asia/Kolkata`), a no-DST zone
    (`Asia/Tokyo`), a full-day window on both transition days (23h / 25h), and API
    round-trips that reject naive input and unknown zones. Freeze "now" for
    minimum-notice logic.

## Sources

- Python `zoneinfo`: https://docs.python.org/3/library/zoneinfo.html
- Python `datetime` (aware/naive, `fold`, comparisons, arithmetic):
  https://docs.python.org/3/library/datetime.html
- PEP 495 — Local Time Disambiguation: https://peps.python.org/pep-0495/
- IANA Time Zone Database: https://www.iana.org/time-zones
- IANA tz database theory (accuracy, interface stability, rule changes, abbreviations):
  https://www.iana.org/time-zones/theory
- RFC 9557 — Date and Time on the Internet: Timestamps with Additional Information:
  https://www.rfc-editor.org/rfc/rfc9557.html
- ECMA-402 `Intl.DateTimeFormat`: https://tc39.es/ecma402/#datetimeformat-objects
- MDN `Intl.DateTimeFormat`:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
- TC39 Temporal proposal docs: https://tc39.es/proposal-temporal/docs/
- Temporal time zone / ambiguity handling:
  https://tc39.es/proposal-temporal/docs/timezone.html
- Calendly — time zone overview: https://calendly.com/help/time-zones-overview
- Calendly API — get event invitee:
  https://developer.calendly.com/api-docs/8305c0ccfac70-get-event-invitee
- Cal.com API — timezones: https://cal.com/docs/api-reference/v2/timezones
- Cal.com API — create a booking:
  https://cal.com/docs/api-reference/v2/bookings/create-a-booking
- Cal.com API — get available time slots:
  https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
- Cal.com source (pinned to `6bfe2df9d13c456dc9374c9e6581b36fba188728`):
  - Prisma schema (Booking/Schedule/Availability):
    https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma
  - Availability expansion (`date-ranges.ts`):
    https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts
  - Booker timezone precedence:
    https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/Booker/utils/getBookerTimezone.ts
  - Pinned timezone hook:
    https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/Booker/hooks/useStableTimezone.ts
  - Timezone test rule:
    https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/agents/rules/testing-timezone.md
- SQLite date/time functions (storage as TEXT/REAL/INTEGER, UTC handling):
  https://www.sqlite.org/lang_datefunc.html
- SQLAlchemy type basics (SQLite stores date/time as strings; `DateTime(timezone=True)`
  needs backend support): https://docs.sqlalchemy.org/en/20/core/type_basics.html
