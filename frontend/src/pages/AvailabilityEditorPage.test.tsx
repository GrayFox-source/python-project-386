import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/availability", () => ({
  createAvailability: vi.fn(),
  getAvailability: vi.fn(),
  removeAvailability: vi.fn(),
  replaceAvailability: vi.fn(),
}))

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    host: {
      id: "host-1",
      email: "host@example.com",
      timezone: "Europe/Moscow",
    },
  }),
}))

import {
  createAvailability,
  getAvailability,
  removeAvailability,
  replaceAvailability,
} from "@/api/availability"
import type { Availability } from "@/api/client"
import { ApiRequestError } from "@/api/request"

import { AvailabilityEditorPage } from "./AvailabilityEditorPage"

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
  meeting_types_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockedCreate = vi.mocked(createAvailability)
const mockedGet = vi.mocked(getAvailability)
const mockedRemove = vi.mocked(removeAvailability)
const mockedReplace = vi.mocked(replaceAvailability)

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard/availability"
          element={<div>Список расписаний</div>}
        />
        <Route
          path="/dashboard/availability/new"
          element={<AvailabilityEditorPage />}
        />
        <Route
          path="/dashboard/availability/:id"
          element={<AvailabilityEditorPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

function fillName(value: string) {
  fireEvent.change(screen.getByLabelText("Название"), {
    target: { value },
  })
}

beforeEach(() => {
  mockedCreate.mockReset()
  mockedGet.mockReset()
  mockedRemove.mockReset()
  mockedReplace.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("AvailabilityEditorPage", () => {
  it("prefills a new weekday schedule in the Host timezone", () => {
    renderEditor("/dashboard/availability/new")

    expect(
      screen.getByRole("heading", { level: 1, name: "Новое расписание" })
    ).toBeTruthy()
    expect(screen.getByLabelText("Таймзона")).toHaveValue("Europe/Moscow")
    expect(screen.getByLabelText("Понедельник: начало 1")).toHaveValue("09:00")
    expect(screen.getByLabelText("Понедельник: конец 1")).toHaveValue("17:00")
    expect(screen.getByText("Суббота")).toBeTruthy()
    expect(screen.getAllByText("Выходной")).toHaveLength(2)
  })

  it("creates an availability with multiple weekly intervals", async () => {
    mockedCreate.mockResolvedValue({ ...availability, id: "new-id" })

    renderEditor("/dashboard/availability/new")
    fillName("Рабочие часы")

    const monday = screen
      .getByRole("heading", { name: "Понедельник" })
      .closest("section")
    expect(monday).not.toBeNull()
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Добавить интервал" })
        .find((button) => monday?.contains(button)) as HTMLElement
    )

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    expect(await screen.findByText("Список расписаний")).toBeTruthy()
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Рабочие часы",
        timezone: "Europe/Moscow",
        weekly: expect.objectContaining({
          "1": [
            { start: "09:00", end: "17:00" },
            { start: "09:00", end: "17:00" },
          ],
        }),
      })
    )
  })

  it("loads and replaces an existing availability", async () => {
    mockedGet.mockResolvedValue(availability)
    mockedReplace.mockResolvedValue({
      ...availability,
      name: "Новое имя",
    })

    renderEditor("/dashboard/availability/availability-1")

    await screen.findByDisplayValue("Рабочие часы")
    fillName("Новое имя")
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    await waitFor(() => {
      expect(mockedReplace).toHaveBeenCalledWith(
        "availability-1",
        expect.objectContaining({ name: "Новое имя" })
      )
    })
    expect(await screen.findByText("Список расписаний")).toBeTruthy()
  })

  it("shows a field-level error returned by the API", async () => {
    mockedCreate.mockRejectedValue(
      new ApiRequestError(
        {
          detail: {
            code: "duplicate_availability_name",
            message: "An Availability with this name already exists.",
          },
        },
        422
      )
    )

    renderEditor("/dashboard/availability/new")
    fillName("Рабочие часы")
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    expect(
      await screen.findByText("An Availability with this name already exists.")
    ).toBeTruthy()
  })

  it("submits a closed date override", async () => {
    mockedCreate.mockResolvedValue({ ...availability, id: "new-id" })

    renderEditor("/dashboard/availability/new")
    fillName("Рабочие часы")
    fireEvent.click(screen.getByRole("button", { name: "Добавить исключение" }))
    fireEvent.change(screen.getByLabelText("Дата"), {
      target: { value: "2026-12-31" },
    })
    fireEvent.click(screen.getByLabelText("Выходной"))
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: [{ date: "2026-12-31", closed: true }],
        })
      )
    })
  })

  it("submits an open date override with its own intervals", async () => {
    mockedCreate.mockResolvedValue({ ...availability, id: "new-id" })

    renderEditor("/dashboard/availability/new")
    fillName("Рабочие часы")
    fireEvent.click(screen.getByRole("button", { name: "Добавить исключение" }))

    const overrides = screen
      .getByText("Исключения по датам")
      .closest("div.rounded-xl") as HTMLElement
    fireEvent.change(within(overrides).getByLabelText("Дата"), {
      target: { value: "2026-12-31" },
    })
    fireEvent.change(within(overrides).getByLabelText("Конец"), {
      target: { value: "15:00" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: [
            {
              date: "2026-12-31",
              closed: false,
              intervals: [{ start: "09:00", end: "15:00" }],
            },
          ],
        })
      )
    })
  })

  it("attributes an override overlap error to the overrides field", async () => {
    mockedCreate.mockRejectedValue(
      new ApiRequestError(
        {
          detail: [
            {
              loc: ["body", "overrides", 0, "intervals"],
              msg: "Intervals in one day must not overlap.",
              type: "value_error",
              code: "overlapping_windows",
            },
          ],
        },
        422
      )
    )

    renderEditor("/dashboard/availability/new")
    fillName("Рабочие часы")
    fireEvent.click(screen.getByRole("button", { name: "Добавить исключение" }))
    fireEvent.change(screen.getByLabelText("Дата"), {
      target: { value: "2026-12-31" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }))

    const message = await screen.findByText(
      "Intervals in one day must not overlap."
    )
    const overrides = screen
      .getByText("Исключения по датам")
      .closest("div.rounded-xl") as HTMLElement
    const weekly = screen
      .getByText("Недельные окна")
      .closest("div.rounded-xl") as HTMLElement

    expect(overrides.contains(message)).toBe(true)
    expect(weekly.contains(message)).toBe(false)
  })

  it("deletes an unused availability after confirmation", async () => {
    mockedGet.mockResolvedValue(availability)
    mockedRemove.mockResolvedValue()
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true))

    renderEditor("/dashboard/availability/availability-1")

    await screen.findByDisplayValue("Рабочие часы")
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }))

    await waitFor(() => {
      expect(mockedRemove).toHaveBeenCalledWith("availability-1")
    })
    expect(await screen.findByText("Список расписаний")).toBeTruthy()
    vi.restoreAllMocks()
  })
})
