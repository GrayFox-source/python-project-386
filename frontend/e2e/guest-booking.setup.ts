import { expect, test } from "@playwright/test"

import {
  API_BASE_URL,
  AVAILABILITY_NAME,
  HOST_EMAIL,
  HOST_PASSWORD,
  MEETING_TYPE_SLUG,
  MEETING_TYPE_TITLE,
} from "./constants"

type Availability = {
  id: string
  name: string
}

type MeetingType = {
  id: string
  slug: string
  status: "active" | "archived"
}

const WEEKLY = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7].map((day) => [
    String(day),
    [{ start: "09:00", end: "18:00" }],
  ])
)

test("готовит тестовый Meeting Type для сценария гостя", async ({
  request,
}) => {
  const login = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email: HOST_EMAIL, password: HOST_PASSWORD },
  })
  expect(login.ok()).toBeTruthy()

  const availabilityResponse = await request.get(
    `${API_BASE_URL}/hosts/me/availabilities`
  )
  expect(availabilityResponse.ok()).toBeTruthy()
  const { items: availabilities } = (await availabilityResponse.json()) as {
    items: Availability[]
  }

  let availability = availabilities.find(
    (item) => item.name === AVAILABILITY_NAME
  )

  if (!availability) {
    const response = await request.post(
      `${API_BASE_URL}/hosts/me/availabilities`,
      {
        data: {
          name: AVAILABILITY_NAME,
          timezone: "Europe/Moscow",
          weekly: WEEKLY,
          overrides: [],
        },
      }
    )
    expect(response.ok()).toBeTruthy()
    availability = (await response.json()) as Availability
  }

  const meetingTypesResponse = await request.get(
    `${API_BASE_URL}/hosts/me/meeting-types`,
    { params: { limit: 200 } }
  )
  expect(meetingTypesResponse.ok()).toBeTruthy()
  const { items: meetingTypes } = (await meetingTypesResponse.json()) as {
    items: MeetingType[]
  }

  const existing = meetingTypes.find(
    (item) => item.slug === MEETING_TYPE_SLUG
  )

  if (existing) {
    if (existing.status !== "active") {
      const response = await request.post(
        `${API_BASE_URL}/hosts/me/meeting-types/${existing.id}/unarchive`
      )
      expect(response.ok()).toBeTruthy()
    }
    return
  }

  const response = await request.post(
    `${API_BASE_URL}/hosts/me/meeting-types`,
    {
      data: {
        title: MEETING_TYPE_TITLE,
        description: "Тестовый тип встречи для E2E-сценария гостя.",
        duration_minutes: 30,
        format: "online",
        location: "https://example.com/e2e-meeting",
        slug: MEETING_TYPE_SLUG,
        availability_id: availability.id,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        minimum_notice_minutes: 0,
        booking_horizon_days: 60,
        slot_interval_minutes: 30,
      },
    }
  )
  expect(response.ok()).toBeTruthy()

  const created = (await response.json()) as MeetingType
  expect(created.slug).toBe(MEETING_TYPE_SLUG)
})
