import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import HostDashboard from "./HostDashboard"

afterEach(cleanup)

describe("HostDashboard", () => {
  it("renders the page heading", () => {
    render(<HostDashboard />)
    expect(
      screen.getByRole("heading", { level: 1, name: "Кабинет Хоста" })
    ).toBeTruthy()
  })

  it("shows the empty state when the host has no upcoming bookings", () => {
    render(<HostDashboard />)
    expect(screen.getByText("Ближайших бронирований нет")).toBeTruthy()
  })

  it("renders the action buttons", () => {
    render(<HostDashboard />)
    expect(
      screen.getByRole("button", { name: "Создать тип встречи" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Все бронирования" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Настройки" })).toBeTruthy()
  })

  it("renders exactly three action buttons", () => {
    render(<HostDashboard />)
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })
})
