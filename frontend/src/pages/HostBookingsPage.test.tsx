import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/bookings", () => ({
  BOOKING_STATUS_LABELS: {
    pending: "Ожидает подтверждения",
    confirmed: "Подтверждена",
    cancelled: "Отменена",
    expired: "Истекла",
  },
  listHostBookings: vi.fn(),
  confirmHostBooking: vi.fn(),
  cancelHostBooking: vi.fn(),
}))

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    host: { timezone: "Europe/Moscow" },
  }),
}))

import {
  cancelHostBooking,
  confirmHostBooking,
  listHostBookings,
} from "@/api/bookings"
import type { HostBooking } from "@/api/client"

import { HostBookingsPage } from "./HostBookingsPage"

const booking: HostBooking = {
  id: "booking-1",
  meeting_type_id: "meeting-type-1",
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
  updated_at: "2030-01-10T09:00:00Z",
  meeting_type_title: "Консультация",
  meeting_type_slug: "consultation",
}

const mockedList = vi.mocked(listHostBookings)
const mockedConfirm = vi.mocked(confirmHostBooking)
const mockedCancel = vi.mocked(cancelHostBooking)

function renderPage() {
  return render(
    <MemoryRouter>
      <HostBookingsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedList.mockResolvedValue({ items: [booking], total: 1 })
  mockedConfirm.mockResolvedValue({ ...booking, status: "confirmed" })
  mockedCancel.mockResolvedValue({
    ...booking,
    status: "cancelled",
    cancelled_by: "host",
    cancellation_reason: "Не смогу",
  })
})

afterEach(cleanup)

describe("HostBookingsPage", () => {
  it("lists bookings with guest details and actions", async () => {
    renderPage()

    expect(await screen.findByText("Консультация")).toBeTruthy()
    expect(screen.getByText("Иван")).toBeTruthy()
    expect(screen.getByText("guest@example.com")).toBeTruthy()
    expect(screen.getByText("Ожидает подтверждения")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Подтвердить" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Отменить" })).toBeTruthy()
    expect(mockedList).toHaveBeenCalledWith({})
  })

  it("confirms a pending booking", async () => {
    renderPage()

    fireEvent.click(
      await screen.findByRole("button", { name: "Подтвердить" })
    )

    expect(await screen.findByText("Подтверждена")).toBeTruthy()
    expect(mockedConfirm).toHaveBeenCalledWith("booking-1")
  })

  it("cancels a booking with a reason", async () => {
    renderPage()

    fireEvent.click(
      await screen.findByRole("button", { name: "Отменить" })
    )
    fireEvent.change(screen.getByLabelText("Причина отмены"), {
      target: { value: "Не смогу" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить отмену" })
    )

    expect(await screen.findByText("Отменена")).toBeTruthy()
    expect(mockedCancel).toHaveBeenCalledWith("booking-1", "Не смогу")
  })

  it("shows an empty state", async () => {
    mockedList.mockResolvedValue({ items: [], total: 0 })

    renderPage()

    expect(
      await screen.findByText("Бронирований с выбранным статусом нет.")
    ).toBeTruthy()
  })
})
