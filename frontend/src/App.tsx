import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/ProtectedRoute"
import { AvailabilityEditorPage } from "@/pages/AvailabilityEditorPage"
import { AvailabilityListPage } from "@/pages/AvailabilityListPage"
import { DashboardLayout } from "@/pages/DashboardLayout"
import HostDashboard from "@/pages/HostDashboard"
import { LoginPage } from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/NotFoundPage"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<HostDashboard />} />
          <Route
            path="/dashboard/availability"
            element={<AvailabilityListPage />}
          />
          <Route
            path="/dashboard/availability/new"
            element={<AvailabilityEditorPage />}
          />
          <Route
            path="/dashboard/availability/:id"
            element={<AvailabilityEditorPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
