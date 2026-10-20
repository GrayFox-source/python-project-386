import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/booking-page", () => ({
  getPublicMeetingType: vi.fn(),
  listPublicSlots: vi.fn(),
}))

vi.mock("@/api/bookings", () => ({
  createBooking: vi.fn(),
}))

vi.mock("@/domain/timezones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/timezones")>()
  return {
    ...actual,
    browserTimezone: () => "UTC",
    nextLocalDates: (_value: Date, _timezone: string, count: number) =>
      Array.from({ length: count }, (_, index) =>
        new Date(Date.UTC(2026, 0, 5 + index)).toISOString().slice(0, 10)
      ),
  }
})

import { getPublicMeetingType, listPublicSlots } from "@/api/booking-page"
import { createBooking } from "@/api/bookings"
import type {
  BookingCreated,
  MeetingType,
  SlotListResponse,
} from "@/api/client"
import { ApiRequestError } from "@/api/request"

import { PublicBookingPage } from "./PublicBookingPage"

const meetingType: MeetingType = {
  id: "meeting-type-1",
  title: "Консультация",
  description: "Разбор задачи",
  duration_minutes: 30,
  format: "online",
  location: "https://meet.example.com/room",
  slug: "consultation",
  availability_id: "availability-1",
  status: "active",
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  booking_horizon_days: 60,
  slot_interval_minutes: 30,
  scheduling_link: "http://localhost:5173/book/consultation",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const slotResponse: SlotListResponse = {
  timezone: "UTC",
  days: [
    {
      date: "2026-01-05",
      slots: [
        { start: "2026-01-05T06:00:00Z", end: "2026-01-05T06:30:00Z" },
        { start: "2026-01-05T06:30:00Z", end: "2026-01-05T07:00:00Z" },
      ],
    },
    {
      date: "2026-01-06",
      slots: [{ start: "2026-01-06T07:00:00Z", end: "2026-01-06T07:30:00Z" }],
    },
  ],
}

const mockedGetMeetingType = vi.mocked(getPublicMeetingType)
const mockedListSlots = vi.mocked(listPublicSlots)
const mockedCreateBooking = vi.mocked(createBooking)

const createdBooking: BookingCreated = {
  id: "booking-1",
  meeting_type_id: meetingType.id,
  guest_name: "Иван",
  guest_email: "guest@example.com",
  comment: null,
  status: "pending",
  starts_at: "2026-01-05T06:00:00Z",
  ends_at: "2026-01-05T06:30:00Z",
  expires_at: "2026-01-06T05:00:00Z",
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  token: "secret-token",
  booking_url: "http://localhost:5173/booking/secret-token",
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/book/consultation"]}>
      <Routes>
        <Route path="/book/:slug" element={<PublicBookingPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetMeetingType.mockResolvedValue(meetingType)
  mockedListSlots.mockResolvedValue(slotResponse)
  mockedCreateBooking.mockResolvedValue(createdBooking)
})

afterEach(cleanup)

describe("PublicBookingPage", () => {
  it("shows the meeting type, timezone selector and available slots", async () => {
    renderPage()

    expect(await screen.findByText("Консультация")).toBeTruthy()
    expect(screen.getByText("Разбор задачи")).toBeTruthy()
    expect(screen.getByText("30 мин · Онлайн")).toBeTruthy()
    expect(screen.getByLabelText("Ваша таймзона")).toBeTruthy()
    expect(
      await screen.findByRole("button", { name: /понедельник, 5 января/i })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "06:00" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "06:30" })).toBeTruthy()
  })

  it("reveals slots for the selected date", async () => {
    renderPage()

    fireEvent.click(
      await screen.findByRole("button", { name: /вторник, 6 января/i })
    )

    expect(screen.getByRole("button", { name: "07:00" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "06:00" })).toBeNull()
  })

  it("lets the guest select a slot", async () => {
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "06:00" }))

    expect(screen.getByText("Данные гостя")).toBeTruthy()
    expect(screen.getByText(/06:00 \(UTC\)/)).toBeTruthy()
  })

  it("creates a booking and shows the one-time link", async () => {
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "06:00" }))
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    })
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Забронировать" }))

    expect(await screen.findByText("Бронирование создано")).toBeTruthy()
    expect(
      screen.getByRole("link", {
        name: "Открыть страницу бронирования",
      }).getAttribute("href")
    ).toBe("/booking/secret-token")
    expect(mockedCreateBooking).toHaveBeenCalledWith(
      "consultation",
      expect.objectContaining({
        guest_name: "Иван",
        guest_email: "guest@example.com",
        starts_at: "2026-01-05T06:00:00Z",
      }),
      expect.any(String)
    )
  })

  it("shows a conflict message and refreshes slots", async () => {
    mockedCreateBooking.mockRejectedValue(
      new ApiRequestError({ detail: { code: "slot_taken" } }, 409)
    )

    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "06:00" }))
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "Иван" },
    })
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Забронировать" }))

    expect(
      await screen.findByText("Это время уже занято. Выберите другой слот.")
    ).toBeTruthy()
    expect(mockedListSlots).toHaveBeenCalledTimes(2)
  })

  it("shows an empty state when there are no slots", async () => {
    mockedListSlots.mockResolvedValue({ timezone: "UTC", days: [] })

    renderPage()

    expect(await screen.findByText("Нет доступных слотов")).toBeTruthy()
  })

  it("shows a not-found state for an unknown slug", async () => {
    mockedGetMeetingType.mockRejectedValue(new ApiRequestError({}, 404))

    renderPage()

    expect(await screen.findByText("Тип встречи не найден")).toBeTruthy()
  })

  it("shows an archived state", async () => {
    mockedGetMeetingType.mockRejectedValue(new ApiRequestError({}, 410))

    renderPage()

    expect(await screen.findByText("Тип встречи архивирован")).toBeTruthy()
  })

  it("retries loading slots after an error", async () => {
    mockedListSlots
      .mockRejectedValueOnce(new ApiRequestError({}, 500))
      .mockResolvedValueOnce(slotResponse)

    renderPage()

    expect(await screen.findByText("Не удалось загрузить слоты")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }))

    expect(await screen.findByRole("button", { name: "06:00" })).toBeTruthy()
  })
})
