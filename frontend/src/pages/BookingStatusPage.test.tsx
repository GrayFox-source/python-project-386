import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/bookings", () => ({
  BOOKING_STATUS_LABELS: {
    pending: "Ожидает подтверждения",
    confirmed: "Подтверждена",
    cancelled: "Отменена",
    expired: "Истекла",
  },
  getGuestBooking: vi.fn(),
  cancelGuestBooking: vi.fn(),
}))

import { cancelGuestBooking, getGuestBooking } from "@/api/bookings"
import type { GuestBookingView } from "@/api/client"
import { ApiRequestError } from "@/api/request"

import { BookingStatusPage } from "./BookingStatusPage"

const booking: GuestBookingView = {
  guest_name: "Иван",
  guest_email: "guest@example.com",
  comment: "Нужна консультация",
  status: "pending",
  starts_at: "2030-01-15T09:00:00Z",
  ends_at: "2030-01-15T09:30:00Z",
  expires_at: "2030-01-14T09:00:00Z",
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  created_at: "2030-01-10T09:00:00Z",
  meeting_type: {
    title: "Консультация",
    description: "Разбор задачи",
    duration_minutes: 30,
    format: "online",
    location: "https://meet.example.com/room",
  },
}

const mockedGet = vi.mocked(getGuestBooking)
const mockedCancel = vi.mocked(cancelGuestBooking)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/booking/secret-token"]}>
      <Routes>
        <Route path="/booking/:token" element={<BookingStatusPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGet.mockResolvedValue(booking)
  mockedCancel.mockResolvedValue({
    ...booking,
    status: "cancelled",
    cancelled_by: "guest",
    cancellation_reason: "Планы изменились",
  })
})

afterEach(cleanup)

describe("BookingStatusPage", () => {
  it("shows booking details and the cancel form", async () => {
    renderPage()

    expect(
      await screen.findByRole("heading", { name: "Консультация" })
    ).toBeTruthy()
    expect(screen.getByText("Ожидает подтверждения")).toBeTruthy()
    expect(screen.getByText("Иван")).toBeTruthy()
    expect(screen.getByText("guest@example.com")).toBeTruthy()
    expect(screen.getByText("Нужна консультация")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Отменить встречу" })
    ).toBeTruthy()
  })

  it("cancels the booking by token", async () => {
    renderPage()

    await screen.findByText("Иван")
    fireEvent.change(screen.getByLabelText("Причина отмены"), {
      target: { value: "Планы изменились" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Отменить встречу" })
    )

    expect(await screen.findByText("Бронирование отменено")).toBeTruthy()
    expect(screen.getByText(/Причина: Планы изменились/)).toBeTruthy()
    expect(mockedCancel).toHaveBeenCalledWith(
      "secret-token",
      "Планы изменились"
    )
  })

  it("shows a not-found state for an unknown token", async () => {
    mockedGet.mockRejectedValue(new ApiRequestError({}, 404))

    renderPage()

    expect(
      await screen.findByText("Бронирование не найдено")
    ).toBeTruthy()
  })
})
