import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/availability", () => ({
  listAvailabilities: vi.fn(),
}))

import { listAvailabilities } from "@/api/availability"
import type { Availability } from "@/api/client"
import { ApiRequestError } from "@/api/request"

import { AvailabilityListPage } from "./AvailabilityListPage"

const availability: Availability = {
  id: "availability-1",
  name: "Рабочие часы",
  timezone: "Europe/Moscow",
  weekly: {
    "1": [{ start: "09:00", end: "17:00" }],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
    "7": [],
  },
  overrides: [],
  meeting_types_count: 2,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockedList = vi.mocked(listAvailabilities)

function renderPage() {
  return render(
    <MemoryRouter>
      <AvailabilityListPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockedList.mockReset()
})

afterEach(cleanup)

describe("AvailabilityListPage", () => {
  it("shows an empty state with a create action", async () => {
    mockedList.mockResolvedValue({ items: [], total: 0 })

    renderPage()

    expect(await screen.findByText("Расписаний пока нет")).toBeTruthy()
    expect(
      screen.getAllByRole("link", { name: "Создать расписание" })
    ).toHaveLength(2)
  })

  it("lists availabilities with timezone, usage and edit link", async () => {
    mockedList.mockResolvedValue({ items: [availability], total: 1 })

    renderPage()

    expect(await screen.findByText("Рабочие часы")).toBeTruthy()
    expect(screen.getByText(/Europe\/Moscow/)).toBeTruthy()
    expect(screen.getByText("Используется: 2")).toBeTruthy()
    expect(
      screen.getAllByRole("link", { name: "Редактировать" })[0]?.getAttribute(
        "href"
      )
    ).toBe("/dashboard/availability/availability-1")
  })

  it("shows an error and retries the request", async () => {
    mockedList
      .mockRejectedValueOnce(new ApiRequestError({}, 500))
      .mockResolvedValueOnce({ items: [availability], total: 1 })

    renderPage()

    expect(await screen.findByText("Не удалось загрузить расписания.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }))

    expect(await screen.findByText("Рабочие часы")).toBeTruthy()
  })
})
