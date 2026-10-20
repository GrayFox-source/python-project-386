import { render, screen, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, it, expect } from "vitest"
import HostDashboard from "./HostDashboard"

afterEach(cleanup)

describe("HostDashboard", () => {
  it("renders the page heading", () => {
    render(
      <MemoryRouter>
        <HostDashboard />
      </MemoryRouter>
    )
    expect(
      screen.getByRole("heading", { level: 1, name: "Кабинет Хоста" })
    ).toBeTruthy()
  })

  it("shows the empty state when the host has no upcoming bookings", () => {
    render(
      <MemoryRouter>
        <HostDashboard />
      </MemoryRouter>
    )
    expect(screen.getByText("Ближайших бронирований нет")).toBeTruthy()
  })

  it("renders the action controls", () => {
    render(
      <MemoryRouter>
        <HostDashboard />
      </MemoryRouter>
    )
    expect(
      screen.getByRole("link", { name: "Создать тип встречи" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Все бронирования" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Настройки" })).toBeTruthy()
  })

  it("renders exactly two buttons and one link", () => {
    render(
      <MemoryRouter>
        <HostDashboard />
      </MemoryRouter>
    )
    expect(screen.getAllByRole("button")).toHaveLength(2)
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })
})
