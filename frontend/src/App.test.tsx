import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth")>()

  return {
    ...actual,
    getCurrentHost: vi.fn(),
    loginHost: vi.fn(),
    logoutHost: vi.fn(),
  }
})

import {
  ApiRequestError,
  getCurrentHost,
  loginHost,
  logoutHost,
} from "@/api/auth"
import { HOST_SESSION_EXPIRED_EVENT } from "@/api/client"
import type { Host } from "@/api/client"
import { AuthProvider } from "@/auth/AuthProvider"

import App from "./App"

const host: Host = {
  id: "host-1",
  email: "host@example.com",
  timezone: "Europe/Moscow",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const mockedGetCurrentHost = vi.mocked(getCurrentHost)
const mockedLoginHost = vi.mocked(loginHost)
const mockedLogoutHost = vi.mocked(logoutHost)

function LocationProbe() {
  const location = useLocation()

  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  )
}

function renderApp(initialPath = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <LocationProbe />
        <App />
      </AuthProvider>
    </MemoryRouter>
  )
}

function fillLoginForm(email = host.email, password = "secret") {
  fireEvent.change(screen.getByLabelText("Электронная почта"), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText("Пароль"), {
    target: { value: password },
  })
}

beforeEach(() => {
  mockedGetCurrentHost.mockReset()
  mockedLoginHost.mockReset()
  mockedLogoutHost.mockReset()
})

afterEach(cleanup)

describe("App auth flow", () => {
  it("shows a loading state while the session is checked", async () => {
    mockedGetCurrentHost.mockReturnValue(new Promise(() => {}))

    renderApp()

    expect(await screen.findByText("Проверяем сессию…")).toBeTruthy()
  })

  it("redirects an unauthenticated host from /dashboard to /login", async () => {
    mockedGetCurrentHost.mockRejectedValue(new ApiRequestError({}, 401))

    renderApp()

    expect(
      await screen.findByRole("heading", { name: "Вход в кабинет" })
    ).toBeTruthy()
  })

  it("shows a retry state instead of logging out on a session check failure", async () => {
    mockedGetCurrentHost
      .mockRejectedValueOnce(new ApiRequestError({}, 500))
      .mockResolvedValueOnce(host)

    renderApp()

    expect(await screen.findByText("Не удалось проверить сессию")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }))

    expect(
      await screen.findByRole("heading", { level: 1, name: "Кабинет Хоста" })
    ).toBeTruthy()
  })

  it("returns to login when the session expires", async () => {
    mockedGetCurrentHost.mockResolvedValue(host)

    renderApp("/dashboard")
    await screen.findByRole("heading", { level: 1, name: "Кабинет Хоста" })

    act(() => {
      window.dispatchEvent(new Event(HOST_SESSION_EXPIRED_EVENT))
    })

    expect(
      await screen.findByRole("heading", { name: "Вход в кабинет" })
    ).toBeTruthy()
  })

  it("logs in and returns to the originally requested dashboard path", async () => {
    mockedGetCurrentHost.mockRejectedValue(new ApiRequestError({}, 401))
    mockedLoginHost.mockResolvedValue(host)

    renderApp("/dashboard?tab=settings#upcoming")
    await screen.findByRole("heading", { name: "Вход в кабинет" })

    fillLoginForm()
    fireEvent.click(screen.getByRole("button", { name: "Войти" }))

    await waitFor(() => {
      expect(mockedLoginHost).toHaveBeenCalledWith({
        email: host.email,
        password: "secret",
      })
    })
    expect(
      await screen.findByRole("heading", { level: 1, name: "Кабинет Хоста" })
    ).toBeTruthy()
    expect(screen.getByTestId("location").textContent).toBe(
      "/dashboard?tab=settings#upcoming"
    )
  })

  it("shows a submitting state and then the dashboard", async () => {
    mockedGetCurrentHost.mockRejectedValue(new ApiRequestError({}, 401))
    let resolveLogin: (value: Host) => void = () => {}
    mockedLoginHost.mockReturnValue(
      new Promise<Host>((resolve) => {
        resolveLogin = resolve
      })
    )

    renderApp()
    await screen.findByRole("heading", { name: "Вход в кабинет" })
    fillLoginForm()
    fireEvent.click(screen.getByRole("button", { name: "Войти" }))

    expect(
      await screen.findByRole("button", { name: "Вход…" })
    ).toBeTruthy()

    await act(async () => {
      resolveLogin(host)
    })

    expect(
      await screen.findByRole("heading", { level: 1, name: "Кабинет Хоста" })
    ).toBeTruthy()
  })

  it("shows a field-level login error for invalid credentials", async () => {
    mockedGetCurrentHost.mockRejectedValue(new ApiRequestError({}, 401))
    mockedLoginHost.mockRejectedValue(
      new ApiRequestError(
        { detail: { code: "unauthorized", message: "Invalid credentials" } },
        401
      )
    )

    renderApp()
    await screen.findByRole("heading", { name: "Вход в кабинет" })
    fillLoginForm()
    fireEvent.click(screen.getByRole("button", { name: "Войти" }))

    expect(
      await screen.findByText("Неверный адрес электронной почты или пароль.")
    ).toBeTruthy()
  })

  it("logs out and returns to the login page", async () => {
    mockedGetCurrentHost.mockResolvedValue(host)
    mockedLogoutHost.mockResolvedValue(undefined)

    renderApp()
    expect(await screen.findByText(host.email, { exact: false })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }))

    expect(
      await screen.findByRole("heading", { name: "Вход в кабинет" })
    ).toBeTruthy()
    expect(mockedLogoutHost).toHaveBeenCalled()
  })

  it("renders the 404 route for unknown paths", async () => {
    mockedGetCurrentHost.mockResolvedValue(host)

    renderApp("/missing")

    expect(
      await screen.findByRole("heading", { name: "Страница не найдена" })
    ).toBeTruthy()
  })
})
