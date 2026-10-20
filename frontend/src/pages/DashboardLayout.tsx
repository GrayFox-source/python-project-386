import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/auth/use-auth"

export function DashboardLayout() {
  const { host, logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
    } catch {
      // AuthProvider clears the local session even when the request fails.
    } finally {
      setIsLoggingOut(false)
      navigate("/login", { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-sm font-medium">Booking</p>
            {host && (
              <p className="text-xs text-muted-foreground">
                {host.email} · {host.timezone}
              </p>
            )}
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <NavLink
              className={({ isActive }) =>
                isActive ? "font-medium" : "text-muted-foreground"
              }
              end
              to="/dashboard"
            >
              Обзор
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? "font-medium" : "text-muted-foreground"
              }
              to="/dashboard/availability"
            >
              Расписания
            </NavLink>
          </nav>
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Выходим…" : "Выйти"}
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
