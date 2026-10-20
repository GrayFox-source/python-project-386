import type {
  BookingCancel,
  BookingCreate,
  BookingCreated,
  BookingStatus,
  GuestBookingView,
  HostBooking,
  HostBookingListResponse,
  HostBookingsListData,
} from "./client"
import {
  bookingPageCreateBooking,
  guestBookingsCancel,
  guestBookingsGet,
  hostBookingsCancel,
  hostBookingsConfirm,
  hostBookingsGet,
  hostBookingsList,
} from "./client"
import { unwrap } from "./request"

export async function createBooking(
  slug: string,
  body: BookingCreate,
  idempotencyKey: string
): Promise<BookingCreated> {
  const { data, error, response } = await bookingPageCreateBooking({
    path: { slug },
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  })
  return unwrap(data, error, response)
}

export async function getGuestBooking(
  token: string
): Promise<GuestBookingView> {
  const { data, error, response } = await guestBookingsGet({
    path: { token },
  })
  return unwrap(data, error, response)
}

export async function cancelGuestBooking(
  token: string,
  reason?: string
): Promise<GuestBookingView> {
  const body: BookingCancel = {
    cancellation_reason: reason?.trim() || null,
  }
  const { data, error, response } = await guestBookingsCancel({
    path: { token },
    body,
  })
  return unwrap(data, error, response)
}

export type HostBookingsQuery = NonNullable<HostBookingsListData["query"]>

export async function listHostBookings(
  query: HostBookingsQuery = {}
): Promise<HostBookingListResponse> {
  const { data, error, response } = await hostBookingsList({ query })
  return unwrap(data, error, response)
}

export async function getHostBooking(id: string): Promise<HostBooking> {
  const { data, error, response } = await hostBookingsGet({ path: { id } })
  return unwrap(data, error, response)
}

export async function confirmHostBooking(id: string): Promise<HostBooking> {
  const { data, error, response } = await hostBookingsConfirm({
    path: { id },
  })
  return unwrap(data, error, response)
}

export async function cancelHostBooking(
  id: string,
  reason?: string
): Promise<HostBooking> {
  const body: BookingCancel = {
    cancellation_reason: reason?.trim() || null,
  }
  const { data, error, response } = await hostBookingsCancel({
    path: { id },
    body,
  })
  return unwrap(data, error, response)
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  expired: "Истекла",
}
