import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/availability", () => ({
  listAvailabilities: vi.fn(),
}))

vi.mock("@/api/meeting-types", () => ({
  archiveMeetingType: vi.fn(),
  listMeetingTypes: vi.fn(),
  removeMeetingType: vi.fn(),
  unarchiveMeetingType: vi.fn(),
  createMeetingType: vi.fn(),
  getMeetingType: vi.fn(),
  replaceMeetingType: vi.fn(),
}))

import type { Availability, MeetingType } from "@/api/client"
import { listAvailabilities } from "@/api/availability"
import {
  createMeetingType,
  getMeetingType,
  replaceMeetingType,
} from "@/api/meeting-types"
import { ApiRequestError } from "@/api/request"

import { MeetingTypeEditorPage } from "./MeetingTypeEditorPage"

const availability: Availability = {
  id: "availability-1",
  name: "Основное",
  timezone: "Europe/Moscow",
  weekly: {},
  overrides: [],
  meeting_types_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const meetingType: MeetingType = {
  id: "meeting-type-1",
  title: "Консультация",
  description: "Разбор задачи",
  duration_minutes: 30,
  format: "online",
  location: "https://meet.example.com/room",
  slug: "consultation",
  availability_id: availability.id,
  status: "active",
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 120,
  booking_horizon_days: 60,
  slot_interval_minutes: 30,
  scheduling_link: "http://localhost:5173/book/consultation",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockedListAvailabilities = vi.mocked(listAvailabilities)
const mockedCreate = vi.mocked(createMeetingType)
const mockedGet = vi.mocked(getMeetingType)
const mockedReplace = vi.mocked(replaceMeetingType)

function renderEditor(path = "/dashboard/meeting-types/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard/meeting-types"
          element={<div>Список типов встреч</div>}
        />
        <Route
          path="/dashboard/meeting-types/new"
          element={<MeetingTypeEditorPage />}
        />
        <Route
          path="/dashboard/meeting-types/:id"
          element={<MeetingTypeEditorPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedListAvailabilities.mockResolvedValue({
    items: [availability],
    total: 1,
  })
  mockedCreate.mockResolvedValue(meetingType)
  mockedGet.mockResolvedValue(meetingType)
  mockedReplace.mockResolvedValue(meetingType)
})

afterEach(cleanup)

describe("MeetingTypeEditorPage", () => {
  it("blocks creation until an availability exists", async () => {
    mockedListAvailabilities.mockResolvedValue({ items: [], total: 0 })

    renderEditor()

    expect(
      await screen.findByText("Сначала создайте расписание")
    ).toBeTruthy()
    expect(
      screen.queryByLabelText("Название")
    ).toBeNull()
  })

  it("creates a meeting type with the form values", async () => {
    renderEditor()

    const title = await screen.findByLabelText("Название")
    fireEvent.change(title, { target: { value: "Стратегия" } })
    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "План на квартал" },
    })
    fireEvent.change(screen.getByLabelText("Длительность, мин"), {
      target: { value: "45" },
    })
    fireEvent.change(screen.getByLabelText("Место"), {
      target: { value: "Офис" },
    })
    fireEvent.click(screen.getByRole("radio", { name: "Оффлайн" }))
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        title: "Стратегия",
        description: "План на квартал",
        duration_minutes: 45,
        format: "offline",
        location: "Офис",
        slug: undefined,
        availability_id: availability.id,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        minimum_notice_minutes: 120,
        booking_horizon_days: 60,
        slot_interval_minutes: undefined,
      })
    })
    expect(
      await screen.findByText("Список типов встреч")
    ).toBeTruthy()
  })

  it("loads an existing meeting type and replaces it", async () => {
    renderEditor(`/dashboard/meeting-types/${meetingType.id}`)

    const title = await screen.findByLabelText("Название")
    expect((title as HTMLInputElement).value).toBe("Консультация")
    expect(screen.getByText(meetingType.scheduling_link)).toBeTruthy()
    fireEvent.change(title, { target: { value: "Новая консультация" } })
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    await waitFor(() => {
      expect(mockedReplace).toHaveBeenCalledWith(
        meetingType.id,
        expect.objectContaining({
          title: "Новая консультация",
          slug: "consultation",
        })
      )
    })
  })

  it("shows a slug conflict next to the slug field", async () => {
    mockedCreate.mockRejectedValue(
      new ApiRequestError(
        {
          detail: {
            code: "slug_taken",
            message: "Slug уже используется.",
          },
        },
        409
      )
    )
    renderEditor()

    fireEvent.change(await screen.findByLabelText("Название"), {
      target: { value: "Консультация" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    expect(await screen.findByText("Slug уже используется.")).toBeTruthy()
  })
})
