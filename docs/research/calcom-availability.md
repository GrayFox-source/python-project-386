# Cal.com: Availability model and slot generation

Research ticket: GrayFox-source/python-project-386#3. Findings are from primary
sources: Cal.com official docs and the `calcom/cal.com` source at commit
[`6bfe2df9d13c`](https://github.com/calcom/cal.com/tree/6bfe2df9d13c456dc9374c9e6581b36fba188728)
(`main`). Every non-obvious claim links to the source that owns it.

## Context

Cal.com answers one question: *given one or more hosts, when can an event of
length `L` actually be booked?* The answer is computed as a pipeline:

1. Build each host's **raw availability** as a list of `DateRange`
   (`start`, `end`) from weekly working hours plus date overrides.
2. Collect each host's **busy intervals** from Cal.com bookings, connected
   calendars, booking/duration limits and team limits.
3. `dateRanges - busy = free ranges per host`.
4. **Aggregate** hosts (collective = intersection, round-robin = union per group).
5. Walk the free ranges on a fixed **frequency** and emit slots that fit `L` and
   respect minimum notice, booking window, reserved slots and seat counts.

The public HTTP surface is `GET /v2/slots`; the core engine is
`getSlots` (`packages/features/schedules/lib/slots.ts`) fed by
`getUserAvailability` and `AvailableSlotsService` (formerly `util.ts`).

## Availability model

### Schedule and Availability rows

A **`Schedule`** belongs to a user and carries the timezone the weekly hours are
interpreted in:

```prisma
model Schedule { id, userId, name, timeZone String?, availability Availability[] }
model Availability {
  id, userId?, eventTypeId?, days Int[], startTime DateTime @db.Time,
  endTime DateTime @db.Time, date DateTime? @db.Date, scheduleId?
}
```
Source: [`packages/prisma/schema.prisma`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma#L945-L974).

A single `Availability` table encodes **both** mechanisms, discriminated by
`date`:

- **Weekly recurring window**: `date == null`, `days` = list of weekday numbers
  (`0` = Sunday … `6` = Saturday, via `dayjs().day()`), one row per start/end
  pair. A day can have several rows (split shifts).
  Docs: [Set up your availability](https://cal.com/help/availabilities/availability-dashboard-overview);
  parsing: [`processWorkingHours`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts#L44-L78).
- **Date override**: `date` set, with its own `startTime`/`endTime`. The override
  is emitted for that date only and, because it shares the date's key, replaces
  the weekly ranges for that date; a **zero-length override cancels** the day
  (`// remove 0-length overrides that were kept to cancel out working dates`).
  Source: [`processDateOverride` / `buildDateRanges`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts#L156-L334);
  docs: [Date overrides](https://cal.com/help/availabilities/date-overrides).

### Which schedule applies to an event

Resolution order for a host
([`detectEventTypeScheduleForUser`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/detectEventTypeScheduleForUser.ts#L52-L112)):

1. `eventType.schedule` (event-level schedule)
2. the host's `Host.schedule`
3. the user's default schedule (`user.defaultScheduleId`)
4. fallback: `eventType.timeZone || user.timeZone` + default **Mon–Fri 09:00–17:00**

A schedule marked default is used by every booking link that has none. Multiple
schedules exist mainly so different links can follow different timezones.
Docs: [Multiple schedules](https://cal.com/help/availabilities/multiple-schedules).

### Timezone semantics

- The **schedule timezone** is the timezone the weekly times are authored in, and
  is what `buildDateRanges` uses to place them on the timeline
  ([`buildDateRanges({ timeZone: finalTimezone })`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/getUserAvailability.ts#L511-L517)).
- The user's `timeZone` is only a **fallback** when no schedule/timezone is set
  (see resolution order above).
- **Travel schedules** temporarily override the timezone for the default schedule
  within a date range ([`getAdjustedTimezone`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts#L19-L33)).
- The booker's timezone (`input.timeZone`) is used to **present** slots, to
  evaluate rolling-window/range bounds in the booker's day, and for the response
  date keys — not to shift the organizer's working hours. `useBookerTimezone` can
  make a restriction schedule follow the booker's tz.
  Sources: [`_getAvailableSlots`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/trpc/server/routers/viewer/slots/util.ts#L1013-L1097),
  [`calculatePeriodLimits`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/lib/isOutOfBounds.tsx#L32-L150).
- All timezones are IANA identifiers; the API offers `GET /v2/timezones` to pick
  one ([Timezones](https://cal.com/docs/api-reference/v2/timezones)).

Edge cases handled in code: DST offset correction per day, half-hour offsets
(rounding is checked in the local tz, not UTC), and an end time of `23:59` being
extended by one minute to mean "until midnight".
Source: [`processWorkingHours`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts#L44-L154)
and [`slots.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/slots.ts#L100-L140).

## Slot generation algorithm

Entry point: `getSlots({ inviteeDate, frequency, dateRanges, minimumBookingNotice, eventLength, offsetStart })`
([`slots.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/slots.ts#L58-L264)).

1. **Frequency (slot interval).** `frequency = eventType.slotInterval || input.duration || eventType.length`.
   So by default a 60-min event yields hourly slots; `slotInterval = 30` yields
   :00/:30 starts for the same 60-min event.
   Sources: [`_getAvailableSlots`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/trpc/server/routers/viewer/slots/util.ts#L1091-L1097),
   [Create an event type](https://cal.com/docs/api-reference/v2/event-types/create-an-event-type).
2. **Notice floor.** `startTimeWithMinNotice = now(UTC) + minimumBookingNotice`; a
   range starts at `max(range.start, noticeFloor)`.
3. **Snap to grid.** The first candidate is normalized to the local-timezone
   interval boundary (`startOf("hour") + ceil(minute/interval)*interval`), with a
   `showOptimizedSlots` variant that only nudges by what fits (options 60/30/20/15/10/5).
4. **Walk.** From the candidate, step by `frequency` while
   `slotStart + eventLength - 1s <= range.end`; drop duplicates already emitted
   for the same start (a slot exists at most once even if ranges overlap).
5. **Filter.** Resulting slots are then filtered by restriction schedule,
   future/period limits, minimum notice and requested `start`/`end`.
6. **Group by date** in the response timezone; `onlyShowFirstAvailableSlot`
   keeps only the earliest slot per day.

`dateRanges` itself is derived in two steps:

- **Subtract busy**: `subtract(dateRanges, formattedBusyTimes)`
  ([`getUserAvailability`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/getUserAvailability.ts#L643-L650)).
  `subtract` splits each range around every overlapping excluded range
  ([`date-ranges.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/schedules/lib/date-ranges.ts#L399-L436)).
- **Aggregate hosts**: `getAggregatedAvailability` intersects collective/fixed
  hosts and unions each round-robin group, then prunes redundant ranges
  ([`getAggregatedAvailability.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts#L27-L78)).

### What counts as busy

`getBusyTimes` builds the busy list from:
existing Cal.com bookings, connected-calendar events, per-event and per-team
booking/duration limits, and seat counts
([`getBusyTimes.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/busyTimes/services/getBusyTimes.ts)).

- **Buffers stack both ways.** For an existing booking, the blocked interval is
  `before: eventType.beforeEventBuffer + newEvent.afterEventBuffer` and
  `after: eventType.afterEventBuffer + newEvent.beforeEventBuffer`, so both the
  existing and the requested meeting get their buffers.
  Source: [`getBusyTimes.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/busyTimes/services/getBusyTimes.ts#L130-L181).
  Docs: [Event buffers](https://cal.com/help/event-types/event-buffer) ("buffers
  can stack … you may see more time blocked than the buffer value itself").
- **Seated events**: while seats remain, only the buffers block; once full, the
  whole booking blocks ([`getBusyTimes.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/busyTimes/services/getBusyTimes.ts#L136-L181)).
- **Reschedule**: the booking being rescheduled is excluded from busy times so its
  old slot reappears (`rescheduleUid`; API `bookingUidToReschedule`).
- Conflict test is a simple half-open overlap of the candidate interval with any
  busy interval ([`checkForConflicts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/lib/conflictChecker/checkForConflicts.ts#L27-L50)).

## Edge cases

- **Minimum notice.** `EventType.minimumBookingNotice` (minutes), **default 120**,
  enforced both when generating slots (`startTimeWithMinNotice`) and at booking
  time. Schema: [`EventType`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma#L245-L247);
  docs: [Troubleshoot (Minimum booking notice)](https://cal.com/help/availabilities/troubleshoot-your-availability).
- **Booking horizon.** `EventType.periodType` ∈ `UNLIMITED | ROLLING | ROLLING_WINDOW | RANGE`,
  plus `periodDays`, `periodCountCalendarDays`, `periodStartDate/EndDate`.
  - `ROLLING`: N days from now (business or calendar days; **booker** tz).
  - `ROLLING_WINDOW`: keep N *bookable* days visible, dynamically extending as
    days fill; the search is capped at `ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK = 61`.
  - `RANGE`: fixed start/end dates in the **event** tz.
  Sources: [`calculatePeriodLimits`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/lib/isOutOfBounds.tsx#L32-L150),
  [`constants.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/lib/constants.ts#L199),
  API `bookingWindow` type ([Create an event type](https://cal.com/docs/api-reference/v2/event-types/create-an-event-type)),
  docs: [Limit future bookings](https://cal.com/help/event-types/limit-future-bookings).
- **Max bookings / max duration.** `bookingLimitsCount` (`day/week/month/year`
  number of bookings) and `bookingLimitsDuration` (minutes per period), on the
  event type and the team; once a limit is hit the affected period is injected as
  busy time. `onlyShowFirstAvailableSlot` collapses a day to one slot.
  Sources: [`getBusyTimesFromLimits`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/busyTimes/lib/getBusyTimesFromLimits.ts#L20-L168),
  API schemas above; docs: [Troubleshoot (Booking limits)](https://cal.com/help/availabilities/troubleshoot-your-availability).
  Per-booker: `EventType.maxActiveBookingsPerBooker`.
- **Overlapping existing bookings / calendars** simply subtract from availability;
  the same candidate slot is emitted once even if barriers/overrides overlap
  (`slots` Map keyed by ISO start).
- **Concurrent booking.** The handler re-validates the chosen time
  (`ensureAvailableUsers` → `getUsersAvailability` + `checkForConflicts`) before
  inserting ([`ensureAvailableUsers.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts#L60-L216)),
  but `Booking` has **no unique constraint on `(eventTypeId, startTime)`** (only
  indexes — see [schema](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma#L851-L942)),
  so a re-validation race window remains.
- **Slot reservations** are the explicit soft lock. `POST /v2/slots/reservations`
  inserts a `SelectedSlots` row with `releaseAt = now + duration`
  (**default 5 min**), after checking overlap with active bookings and existing
  reservations and rejecting RR double-booking. Reservation creation is still a
  read-then-insert; the only unique constraint is
  `(userId, slotUtcStartDate, slotUtcEndDate, uid)` — which does *not* prevent two
  different `uid`s from reserving the same time.
  Sources: [`slots.service.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/apps/api/v2/src/modules/slots/slots-2024-09-04/services/slots.service.ts#L95-L231),
  [`slots.repository.ts`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/apps/api/v2/src/modules/slots/slots-2024-09-04/slots.repository.ts#L18-L80),
  [`SelectedSlots`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/prisma/schema.prisma#L1437-L1446),
  docs: [Reserve a slot](https://cal.com/docs/api-reference/v2/slots/reserve-a-slot).
- **Confirmation.** `requiresConfirmation` alone does not block the slot;
  `requiresConfirmationWillBlockSlot` does.
- **Out of office / holidays** are removed from availability but kept in a
  separate `oooExcludedDateRanges` so team events can reason about them
  ([`getUserAvailability`](https://github.com/calcom/cal.com/blob/6bfe2df9d13c456dc9374c9e6581b36fba188728/packages/features/availability/lib/getUserAvailability.ts#L480-L517));
  docs: [Out of office](https://cal.com/help/availabilities/out-of-office).

## API and data model mapping

| Concept | Data model | API v2 |
| --- | --- | --- |
| Weekly hours | `Availability` rows `date == null` | `schedule.availability[].days/startTime/endTime` |
| Date override | `Availability` row with `date` | `schedule.overrides[]` (date/start/end) |
| Schedule tz | `Schedule.timeZone` | `schedule.timeZone` |
| Schedule selection | `EventType.scheduleId` / `Host.scheduleId` | `eventType.scheduleId`, host schedules |
| Slot interval | `EventType.slotInterval` | `eventType.slotInterval` |
| Buffers | `EventType.before/afterEventBuffer` | `beforeEventBuffer` / `afterEventBuffer` |
| Min notice | `EventType.minimumBookingNotice` (120) | `minimumBookingNotice` |
| Horizon | `periodType`, `periodDays`, `periodCountCalendarDays`, `periodStartDate/EndDate` | `bookingWindow` |
| Booking limits | `EventType.bookingLimits`, `durationLimits` (JSON) | `bookingLimitsCount`, `bookingLimitsDuration` |
| Slot query | `getSlots` | `GET /v2/slots` |
| Soft lock | `SelectedSlots` | `POST/DELETE /v2/slots/reservations` |

Docs: [Create a schedule](https://cal.com/docs/api-reference/v2/schedules/create-a-schedule),
[Get a schedule](https://cal.com/docs/api-reference/v2/schedules/get-a-schedule),
[Get available time slots](https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type),
[Create an event type](https://cal.com/docs/api-reference/v2/event-types/create-an-event-type).

`GET /v2/slots` requires full ISO-8601 UTC `start`/`end`; `timeZone` only decides
how slots are *returned* (default UTC); `duration` overrides slot length;
`format=range` returns start+end; `bookingUidToReschedule` removes the old
booking from busy times.

## Implications for our spec

- Model availability as one table of time ranges discriminated by "recurring
  (weekday set)" vs "one date", with an explicit "cancels the day" representation
  (zero-length override), rather than two disjoint concepts.
- Store a timezone on the schedule and resolve fallbacks explicitly
  (event → host → user default → user tz). Keep booker tz purely for display and
  window math, like Cal.com, so results are deterministic.
- Generate candidate starts on a `slotInterval` grid (default = event length),
  require `start + length <= range.end`, and subtract busy intervals before
  walking; dedupe by absolute start time.
- Treat buffers as symmetric: extend busy intervals by *both* the existing and the
  requested event's before/after buffers.
- For the horizon, decide between rolling "N bookable days" (needs a cap) and a
  fixed date range, and pick whose timezone it is evaluated in.
- For concurrency: re-validate at write time and consider a real DB-level lock
  (unique/exclusion constraint or advisory lock). Cal.com's read-then-insert
  reservation is not race-proof, so we should not copy it as the sole guard.

## Sources

Primary (docs):
- https://cal.com/help/availabilities/availability-dashboard-overview
- https://cal.com/help/availabilities/date-overrides
- https://cal.com/help/availabilities/multiple-schedules
- https://cal.com/help/availabilities/out-of-office
- https://cal.com/help/availabilities/troubleshoot-your-availability
- https://cal.com/help/event-types/event-buffer
- https://cal.com/help/event-types/limit-future-bookings
- https://cal.com/docs/api-reference/v2/schedules/create-a-schedule
- https://cal.com/docs/api-reference/v2/schedules/get-a-schedule
- https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
- https://cal.com/docs/api-reference/v2/slots/reserve-a-slot
- https://cal.com/docs/api-reference/v2/event-types/create-an-event-type
- https://cal.com/docs/api-reference/v2/timezones

Primary (source at `6bfe2df9d13c`):
- `packages/prisma/schema.prisma`
- `packages/features/schedules/lib/slots.ts`
- `packages/features/schedules/lib/date-ranges.ts`
- `packages/features/availability/lib/getUserAvailability.ts`
- `packages/features/availability/lib/detectEventTypeScheduleForUser.ts`
- `packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts`
- `packages/features/busyTimes/services/getBusyTimes.ts`
- `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts`
- `packages/features/bookings/lib/conflictChecker/checkForConflicts.ts`
- `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts`
- `packages/trpc/server/routers/viewer/slots/util.ts`
- `packages/lib/isOutOfBounds.tsx`, `packages/lib/constants.ts`
- `apps/api/v2/src/modules/slots/slots-2024-09-04/services/slots.service.ts`
- `apps/api/v2/src/modules/slots/slots-2024-09-04/slots.repository.ts`
