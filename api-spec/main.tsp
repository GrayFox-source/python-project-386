import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Booking API" })
@server("http://localhost:8000", "Local development")
namespace BookingApi;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

@doc("How a Meeting Type is held.")
enum MeetingTypeFormat {
  online,
  offline,
}

@doc("Lifecycle status of a Meeting Type. Archived types reject new Bookings but keep existing ones.")
enum MeetingTypeStatus {
  active,
  archived,
}

@doc("Lifecycle status of a Booking. `cancelled` and `expired` are terminal.")
enum BookingStatus {
  pending,
  confirmed,
  cancelled,
  expired,
}

@doc("Which side cancelled a Booking.")
enum CancelledBy {
  guest,
  host,
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

@doc("A local-time interval on one weekday. Times use a 5-minute grid; `24:00` is allowed only as an end.")
model AvailabilityWindow {
  @doc("Local start time, `HH:MM` on a 5-minute grid.")
  @pattern("^([01][0-9]|2[0-3]):(00|05|10|15|20|25|30|35|40|45|50|55)$")
  start: string;

  @doc("Local end time, `HH:MM` on a 5-minute grid, or `24:00` for local midnight.")
  @pattern("^(([01][0-9]|2[0-3]):(00|05|10|15|20|25|30|35|40|45|50|55)|24:00)$")
  end: string;
}

@doc("Replaces the Weekly Windows of one local date. Either `closed` or a set of intervals.")
model DateOverride {
  @doc("Local date the override applies to.")
  date: plainDate;

  @doc("When true the date is closed; `intervals` must be empty.")
  closed: boolean;

  @doc("Intervals used when `closed` is false.")
  intervals?: AvailabilityWindow[];
}

@doc("Named, Host-scoped schedule of recurring weekly windows plus date overrides.")
model Availability {
  id: string;

  @doc("Unique (case-insensitive) within the Host.")
  name: string;

  @doc("IANA timezone the weekly windows and overrides are interpreted in.")
  timezone: string;

  @doc("Weekly windows keyed by ISO weekday: 1 = Monday … 7 = Sunday. An empty array means a day off.")
  weekly: Record<AvailabilityWindow[]>;

  overrides: DateOverride[];

  @doc("How many Meeting Types reference this Availability, including archived ones.")
  meeting_types_count: int32;

  created_at: utcDateTime;
  updated_at: utcDateTime;
}

model AvailabilityListResponse {
  items: Availability[];
  total: int32;
}

// ---------------------------------------------------------------------------
// Meeting Type
// ---------------------------------------------------------------------------

@doc("A reusable booking template owned by the Host. Guests book Slots against a Meeting Type.")
model MeetingType {
  id: string;

  @doc("1–120 characters after trim.")
  title: string;

  @doc("Optional, at most 2000 characters.")
  description?: string | null;

  @doc("5–480 minutes.")
  duration_minutes: int32;

  format: MeetingTypeFormat;

  @doc("Optional link (online) or address (offline), at most 500 characters.")
  location?: string | null;

  @doc("URL-safe identifier, unique per Host including archived types.")
  slug: string;

  @doc("Availability the Meeting Type draws its Slots from.")
  availability_id: string;

  status: MeetingTypeStatus;

  @doc("0–120 minutes.")
  buffer_before_minutes: int32;

  @doc("0–120 minutes.")
  buffer_after_minutes: int32;

  @doc("0–10080 minutes.")
  minimum_notice_minutes: int32;

  @doc("1–365 calendar days.")
  booking_horizon_days: int32;

  @doc("5–480 minutes; defaults to `duration_minutes`.")
  slot_interval_minutes: int32;

  @doc("Shareable Booking Page URL: `{origin}/book/{slug}`.")
  scheduling_link: string;

  created_at: utcDateTime;
  updated_at: utcDateTime;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

@doc("One concrete start time a Guest can pick.")
model Slot {
  @doc("Slot start as a UTC instant (RFC 3339 `Z`).")
  start: utcDateTime;

  @doc("Slot end as a UTC instant (RFC 3339 `Z`).")
  end: utcDateTime;
}

@doc("Slots grouped by date in the requested display timezone.")
model SlotDay {
  @doc("Local date in the requested display timezone.")
  date: plainDate;

  slots: Slot[];
}

model SlotListResponse {
  @doc("Timezone the slots were grouped in; echoes the request.")
  timezone: string;

  days: SlotDay[];
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

@doc("A commitment created when a Guest picks a Slot of a Meeting Type.")
model Booking {
  id: string;
  meeting_type_id: string;

  @doc("Guest name, required.")
  guest_name: string;

  @doc("Guest email, required and normalised to lower case.")
  guest_email: string;

  @doc("Optional free-form comment, at most 1000 characters.")
  comment?: string | null;

  status: BookingStatus;

  starts_at: utcDateTime;
  ends_at: utcDateTime;

  @doc("Lazy expiry instant: `min(created_at + 24h, starts_at)`.")
  expires_at: utcDateTime;

  cancelled_at?: utcDateTime | null;
  cancelled_by?: CancelledBy | null;

  @doc("Optional cancellation reason, at most 500 characters.")
  cancellation_reason?: string | null;

  created_at: utcDateTime;
  updated_at: utcDateTime;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

@doc("Machine-readable domain error.")
model ApiError {
  @doc("Stable machine-readable code, e.g. `meeting_type_not_found`.")
  code: string;

  @doc("Human-readable message.")
  message: string;
}

@error
model UnauthorizedError {
  @statusCode statusCode: 401;
  detail: ApiError;
}

@error
model NotFoundError {
  @statusCode statusCode: 404;
  detail: ApiError;
}

@error
model GoneError {
  @statusCode statusCode: 410;
  detail: ApiError;
}

@error
model ValidationErrorResponse {
  @statusCode statusCode: 422;
  detail: ApiError;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

@route("/hosts/me/availabilities")
@tag("Availabilities")
interface HostAvailabilities {
  @get
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("List Host-scoped availabilities.")
  list(
    @query limit?: int32,
    @query offset?: int32,
  ): AvailabilityListResponse | UnauthorizedError;
}

@route("/book")
@tag("Booking Page")
interface BookingPage {
  @get
  @route("/{slug}")
  @doc("Meeting Type data for the public Booking Page.")
  getMeetingType(@path slug: string): MeetingType | NotFoundError | GoneError;

  @get
  @route("/{slug}/slots")
  @doc("Available Slots for a Meeting Type over a date range, grouped in the display timezone.")
  listSlots(
    @path slug: string,
    @query from: plainDate,
    @query to: plainDate,
    @query timezone: string,
  ): SlotListResponse | NotFoundError | GoneError | ValidationErrorResponse;
}
