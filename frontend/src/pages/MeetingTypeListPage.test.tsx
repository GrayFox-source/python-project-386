import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/meeting-types", () => ({
  archiveMeetingType: vi.fn(),
  listMeetingTypes: vi.fn(),
  removeMeetingType: vi.fn(),
  unarchiveMeetingType: vi.fn(),
  createMeetingType: vi.fn(),
  getMeetingType: vi.fn(),
  replaceMeetingType: vi.fn(),
}))

import type { MeetingType } from "@/api/client"
import {
  archiveMeetingType,
  listMeetingTypes,
  removeMeetingType,
  unarchiveMeetingType,
} from "@/api/meeting-types"

import { MeetingTypeListPage } from "./MeetingTypeListPage"

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
  minimum_notice_minutes: 120,
  booking_horizon_days: 60,
  slot_interval_minutes: 30,
  scheduling_link: "http://localhost:5173/book/consultation",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const archivedMeetingType: MeetingType = {
  ...meetingType,
  id: "meeting-type-2",
  title: "Старая встреча",
  slug: "old-meeting",
  status: "archived",
  scheduling_link: "http://localhost:5173/book/old-meeting",
}

const mockedList = vi.mocked(listMeetingTypes)
const mockedArchive = vi.mocked(archiveMeetingType)
const mockedUnarchive = vi.mocked(unarchiveMeetingType)
const mockedRemove = vi.mocked(removeMeetingType)

function renderPage() {
  return render(
    <MemoryRouter>
      <MeetingTypeListPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedList.mockResolvedValue({ items: [], total: 0 })
  mockedArchive.mockResolvedValue({ ...meetingType, status: "archived" })
  mockedUnarchive.mockResolvedValue({
    ...archivedMeetingType,
    status: "active",
  })
  mockedRemove.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MeetingTypeListPage", () => {
  it("shows an empty state when there are no meeting types", async () => {
    renderPage()

    expect(
      await screen.findByText("Типов встреч пока нет")
    ).toBeTruthy()
    expect(
      screen.getAllByRole("link", { name: "Создать тип встречи" })
    ).toHaveLength(2)
  })

  it("splits active and archived meeting types into sections", async () => {
    mockedList.mockResolvedValue({
      items: [meetingType, archivedMeetingType],
      total: 2,
    })

    renderPage()

    expect(await screen.findByText("Консультация")).toBeTruthy()
    expect(screen.getByText("Старая встреча")).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: /Активные/ })
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: /Архив/ })).toBeTruthy()
    expect(
      screen.getByRole("link", { name: meetingType.scheduling_link })
    ).toBeTruthy()
    expect(
      screen.getByText(archivedMeetingType.scheduling_link).tagName
    ).toBe("P")
  })

  it("archives an active meeting type in place", async () => {
    mockedList.mockResolvedValue({ items: [meetingType], total: 1 })

    renderPage()
    await screen.findByText("Консультация")
    fireEvent.click(screen.getByRole("button", { name: "Архивировать" }))

    expect(
      await screen.findByRole("button", { name: "Разархивировать" })
    ).toBeTruthy()
    expect(mockedArchive).toHaveBeenCalledWith(meetingType.id)
    expect(screen.getAllByText("Архив")).toHaveLength(2)
  })

  it("unarchives an archived meeting type in place", async () => {
    mockedList.mockResolvedValue({
      items: [archivedMeetingType],
      total: 1,
    })

    renderPage()
    await screen.findByText("Старая встреча")
    fireEvent.click(
      screen.getByRole("button", { name: "Разархивировать" })
    )

    expect(
      await screen.findByRole("button", { name: "Архивировать" })
    ).toBeTruthy()
    expect(mockedUnarchive).toHaveBeenCalledWith(archivedMeetingType.id)
  })

  it("deletes a meeting type after confirmation", async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal("confirm", confirm)
    mockedList.mockResolvedValue({ items: [meetingType], total: 1 })

    renderPage()
    await screen.findByText("Консультация")
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))

    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith(meetingType.id)
    })
    expect(confirm).toHaveBeenCalled()
    expect(
      await screen.findByText("Типов встреч пока нет")
    ).toBeTruthy()
  })

  it("copies an active scheduling link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    mockedList.mockResolvedValue({ items: [meetingType], total: 1 })

    renderPage()
    await screen.findByText("Консультация")
    fireEvent.click(
      screen.getByRole("button", { name: "Копировать ссылку" })
    )

    expect(
      await screen.findByRole("button", { name: "Скопировано" })
    ).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(meetingType.scheduling_link)
  })
})
