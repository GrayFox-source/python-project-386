# Domain Language

Единый контекст домена: сервис бронирования встреч между хостами и гостями. Один контекст — один словарь; границы контекстов появятся, когда появятся.

## Language

**Host:**
The owner of a scheduling page who creates Meeting Types, defines Availability, and receives Bookings.
_Avoid_: account owner, organizer, calendar owner

**Guest:**
An unauthenticated person who selects a time slot on a Meeting Type and books it.
_Avoid_: client, customer, attendee, participant, invitee

**Meeting Type:**
A reusable booking template owned by a Host: it defines duration, format, questions, and which Availability applies to it. Guests book slots against a Meeting Type, never against raw calendar time.
_Avoid_: event, appointment, event type, meeting template

**Availability:**
A Host-owned, named set of recurring weekly windows plus date overrides, interpreted in an IANA timezone, that defines when bookings are accepted. A Meeting Type references exactly one Availability, and several Meeting Types may share the same Availability.
_Avoid_: working hours, schedule, calendar, free/busy, availability rule

**Weekly Window:**
A recurring local-time interval on one weekday inside an Availability. A day may have several windows (split shifts); windows never cross midnight.
_Avoid_: working hours, shift, opening

**Date Override:**
A rule for one local date that replaces that date's Weekly Windows, either with custom intervals or with `closed`.
_Avoid_: exception, holiday, special hours

**Slot:**
One concrete start time a Guest can pick on a Booking Page for a given date, derived from Availability after subtracting busy time and applying duration, buffers, Minimum Notice, and Booking Horizon.
_Avoid_: timeslot, opening, gap, window

**Buffer:**
Padding before or after a Booking that blocks adjacent Bookings; configured per Meeting Type and measured in real minutes.
_Avoid_: padding, gap

**Minimum Notice:**
The minimum real time between "now" and the start of a bookable Slot, configured per Meeting Type.
_Avoid_: lead time, cutoff

**Booking Horizon:**
The rolling window of calendar dates, evaluated in the Availability timezone, through which a Meeting Type accepts new Bookings.
_Avoid_: booking window, max date, limit

**Booking:**
A commitment created when a Guest picks a Slot: a specific Meeting Type, held by a specific Guest, at a specific time, with a status (`pending` | `confirmed` | `cancelled` | `expired`). A `pending` Booking holds its Slot until the Host confirms it or it expires.
_Avoid_: meeting, appointment, reservation, order

**Booking Page:**
The public, unauthenticated page for one Meeting Type: it renders the Host's Availability as Slots and lets a Guest book.
_Avoid_: scheduling page, public page, booking form

**Scheduling Link:**
The shareable URL of a Booking Page, used to distribute a Meeting Type to Guests.
_Avoid_: booking link, calendar link, invite link

## Rejected language

**Meeting** — from early UI copy ("Бронирование встреч"). Means different things to different readers: a Meeting Type, a Booking, or an ad-hoc personal event. Code and specs must use one of the canonical terms above.

**Appointment** — domain-neutral with no distinction between the template and the instance. A Guest books a *slot of a Meeting Type*, producing a *Booking*.

**Event / Event Type** — Cal.com vocabulary, but "event" collides with domain events (event bus). Deliberately not adopted.

**Team** — explicitly out of scope for the current version. The service models one Host per account; no team, organization, or member concepts exist yet.
