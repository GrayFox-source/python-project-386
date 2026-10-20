import { Navigate, Outlet, useLocation } from "react-router-dom"

import { AuthStatusGate } from "./AuthStatusGate"
import { useAuth } from "./use-auth"

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <AuthStatusGate>
      <Outlet />
    </AuthStatusGate>
  )
}
