export type BookingStatus = "pending" | "confirmed" | "cancelled"

/** A commitment created when a Guest picks a Slot: a Meeting Type, held by a Guest, at a specific time. */
export interface Booking {
  id: string
  meetingTypeTitle: string
  guestName: string
  /** ISO 8601 start time of the slot. */
  startsAt: string
  status: BookingStatus
}
