import type { MeetingType, SlotListResponse } from "./client"
import { bookingPageGetMeetingType, bookingPageListSlots } from "./client"
import { unwrap } from "./request"

export async function getPublicMeetingType(slug: string): Promise<MeetingType> {
  const { data, error, response } = await bookingPageGetMeetingType({
    path: { slug },
  })
  return unwrap(data, error, response)
}

export async function listPublicSlots(
  slug: string,
  from: string,
  to: string,
  timezone: string
): Promise<SlotListResponse> {
  const { data, error, response } = await bookingPageListSlots({
    path: { slug },
    query: { from, to, timezone },
  })
  return unwrap(data, error, response)
}
