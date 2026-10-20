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
// Host
// ---------------------------------------------------------------------------

@doc("The single account that owns the scheduling page.")
model Host {
  id: string;

  @doc("Host email, normalised to lower case.")
  email: string;

  @doc("IANA timezone used as the default for new Availability.")
  timezone: string;

  created_at: utcDateTime;
  updated_at: utcDateTime;
}

@doc("Credentials for the single pre-created Host account.")
model LoginRequest {
  email: string;

  @doc("Plaintext password. It is never returned by the API or logged.")
  password: string;
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

@doc("Input payload for creating or replacing an Availability. PUT replaces weekly windows and overrides atomically.")
model AvailabilityWrite {
  @doc("1–100 characters after trim, unique within the Host case-insensitively.")
  name: string;

  @doc("IANA timezone the weekly windows and overrides are interpreted in.")
  timezone: string;

  @doc("Weekly windows keyed by ISO weekday: 1 = Monday … 7 = Sunday. An empty array means a day off.")
  weekly: Record<AvailabilityWindow[]>;

  overrides: DateOverride[];
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

@doc("Input payload for creating or replacing a Meeting Type. On create, omit slug to generate one from the title; on replace, omit it to keep the current slug.")
model MeetingTypeWrite {
  @doc("1–120 characters after trim.")
  title: string;

  @doc("Optional, at most 2000 characters. Trimmed; an empty string is stored as null.")
  description?: string | null;

  @doc("5–480 minutes.")
  duration_minutes: int32;

  format: MeetingTypeFormat;

  @doc("Optional link (online) or address (offline), at most 500 characters. Trimmed; an empty string is stored as null.")
  location?: string | null;

  @doc("Optional URL-safe identifier, unique per Host. Omit to generate from the title.")
  slug?: string;

  @doc("Availability the Meeting Type draws its Slots from.")
  availability_id: string;

  @doc("0–120 minutes. Defaults to 0.")
  buffer_before_minutes?: int32;

  @doc("0–120 minutes. Defaults to 0.")
  buffer_after_minutes?: int32;

  @doc("0–10080 minutes. Defaults to 120.")
  minimum_notice_minutes?: int32;

  @doc("1–365 calendar days. Defaults to 60.")
  booking_horizon_days?: int32;

  @doc("5–480 minutes. Defaults to `duration_minutes`.")
  slot_interval_minutes?: int32;
}

model MeetingTypeListResponse {
  items: MeetingType[];
  total: int32;
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

@doc("Input payload for creating a Booking from a valid Slot.")
model BookingCreate {
  @doc("Guest name, required.")
  guest_name: string;

  @doc("Guest email, required and normalised to lower case.")
  guest_email: string;

  @doc("Optional free-form comment, at most 1000 characters.")
  comment?: string | null;

  @doc("Slot start as a UTC instant (RFC 3339 with offset).")
  starts_at: utcDateTime;
}

@doc("Result of creating a Booking. `token` and `booking_url` are present only on the first creation.")
model BookingCreated {
  ...Booking;

  @doc("Plaintext Guest bearer token. Returned exactly once; only its SHA-256 hash is stored.")
  token: string | null;

  @doc("One-time URL with the plaintext token: `{origin}/booking/{token}`.")
  booking_url: string | null;
}

@doc("HTTP 201 response for a newly created Booking.")
model BookingCreatedResponse {
  @statusCode _: 201;
  ...BookingCreated;
}

@doc("Optional cancellation payload.")
model BookingCancel {
  @doc("Optional cancellation reason, at most 500 characters.")
  cancellation_reason?: string | null;
}

@doc("Public summary of the Meeting Type shown on the Guest Booking page.")
model BookingMeetingTypeSummary {
  title: string;
  description?: string | null;
  duration_minutes: int32;
  format: MeetingTypeFormat;
  location?: string | null;
}

@doc("A Booking as seen by its Guest through the bearer token. Host internals and identifiers are hidden.")
model GuestBookingView {
  guest_name: string;
  guest_email: string;
  comment?: string | null;
  status: BookingStatus;
  starts_at: utcDateTime;
  ends_at: utcDateTime;
  expires_at: utcDateTime;
  cancelled_at?: utcDateTime | null;
  cancelled_by?: CancelledBy | null;
  cancellation_reason?: string | null;
  created_at: utcDateTime;
  meeting_type: BookingMeetingTypeSummary;
}

@doc("A Booking as seen by the Host, with Guest details and Meeting Type summary.")
model HostBooking {
  ...Booking;
  meeting_type_title: string;
  meeting_type_slug: string;
}

model HostBookingListResponse {
  items: HostBooking[];
  total: int32;
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
model ConflictError {
  @statusCode statusCode: 409;
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

@route("/auth")
@tag("Auth")
interface Auth {
  @post
  @route("/login")
  @doc("Authenticate the Host and set the `host_session` httpOnly cookie.")
  login(@body credentials: LoginRequest): Host | UnauthorizedError;

  @post
  @route("/logout")
  @doc("Clear the `host_session` cookie.")
  logout(): {
    @statusCode _: 204;
  };

  @get
  @route("/me")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Return the currently authenticated Host.")
  me(): Host | UnauthorizedError;
}

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

  @post
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Create an Availability for the current Host.")
  create(@body body: AvailabilityWrite): Availability | UnauthorizedError | ValidationErrorResponse;

  @get
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Get one Host-scoped Availability.")
  get(@path id: string): Availability | UnauthorizedError | NotFoundError;

  @put
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Atomically replace an Availability's weekly windows and overrides.")
  replace(
    @path id: string,
    @body body: AvailabilityWrite,
  ): Availability | UnauthorizedError | NotFoundError | ValidationErrorResponse;

  @delete
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Delete an unused Availability.")
  remove(@path id: string): {
    @statusCode _: 204;
  } | UnauthorizedError | NotFoundError | ConflictError;
}

@route("/hosts/me/meeting-types")
@tag("Meeting Types")
interface HostMeetingTypes {
  @get
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("List Host-scoped Meeting Types, newest first.")
  list(
    @query limit?: int32,
    @query offset?: int32,
  ): MeetingTypeListResponse | UnauthorizedError;

  @post
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Create an active Meeting Type.")
  create(
    @body body: MeetingTypeWrite,
  ): MeetingType | UnauthorizedError | NotFoundError | ValidationErrorResponse | ConflictError;

  @get
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Get one Host-scoped Meeting Type.")
  get(@path id: string): MeetingType | UnauthorizedError | NotFoundError;

  @put
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Replace a Meeting Type's editable fields. Status is changed only by archive/unarchive.")
  replace(
    @path id: string,
    @body body: MeetingTypeWrite,
  ): MeetingType | UnauthorizedError | NotFoundError | ValidationErrorResponse | ConflictError;

  @delete
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Delete a Meeting Type that has no Bookings.")
  remove(@path id: string): {
    @statusCode _: 204;
  } | UnauthorizedError | NotFoundError | ConflictError;

  @post
  @route("/{id}/archive")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Archive a Meeting Type while keeping its slug reserved.")
  archive(@path id: string): MeetingType | UnauthorizedError | NotFoundError;

  @post
  @route("/{id}/unarchive")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Return an archived Meeting Type to active use with the same slug.")
  unarchive(@path id: string): MeetingType | UnauthorizedError | NotFoundError;
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

  @post
  @route("/{slug}/bookings")
  @doc("Create a pending Booking. A repeated Idempotency-Key returns the current state with 200 instead of creating a second Booking.")
  createBooking(
    @path slug: string,
    @header("Idempotency-Key") idempotencyKey?: string,
    @body body: BookingCreate,
  ):
    | BookingCreatedResponse
    | BookingCreated
    | NotFoundError
    | GoneError
    | ConflictError
    | ValidationErrorResponse;
}

@route("/bookings")
@tag("Guest Bookings")
interface GuestBookings {
  @get
  @route("/{token}")
  @doc("View one Booking by its Guest bearer token. Returns 404 after `starts_at + 7 days`.")
  get(@path token: string): GuestBookingView | NotFoundError;

  @post
  @route("/{token}/cancel")
  @doc("Cancel one Booking by its Guest bearer token, before `starts_at`.")
  cancel(
    @path token: string,
    @body body: BookingCancel,
  ): GuestBookingView | NotFoundError | ConflictError | ValidationErrorResponse;
}

@route("/hosts/me/bookings")
@tag("Host Bookings")
interface HostBookings {
  @get
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("List Host-scoped Bookings, optionally filtered by status and start range.")
  list(
    @query status?: BookingStatus,
    @query from?: utcDateTime,
    @query to?: utcDateTime,
    @query limit?: int32,
    @query offset?: int32,
  ): HostBookingListResponse | UnauthorizedError | ValidationErrorResponse;

  @get
  @route("/{id}")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Get one Host-scoped Booking.")
  get(@path id: string): HostBooking | UnauthorizedError | NotFoundError;

  @post
  @route("/{id}/confirm")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Confirm a pending Booking before `expires_at`.")
  confirm(
    @path id: string,
  ): HostBooking | UnauthorizedError | NotFoundError | ConflictError;

  @post
  @route("/{id}/cancel")
  @useAuth(ApiKeyAuth<ApiKeyLocation.cookie, "host_session">)
  @doc("Cancel a pending or confirmed Booking before `starts_at`.")
  cancel(
    @path id: string,
    @body body: BookingCancel,
  ):
    | HostBooking
    | UnauthorizedError
    | NotFoundError
    | ConflictError
    | ValidationErrorResponse;
}
