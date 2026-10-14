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
The recurring or explicit windows during which a Host accepts bookings for a Meeting Type.
_Avoid_: working hours, schedule, calendar, free/busy

**Slot:**
One concrete start time a Guest can pick on a Booking Page for a given date.
_Avoid_: timeslot, opening, gap, window

**Booking:**
A confirmed commitment created when a Guest picks a Slot: a specific Meeting Type, held by a specific Guest, at a specific time, with a status (`pending` | `confirmed` | `cancelled`).
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
