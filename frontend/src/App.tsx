import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/ProtectedRoute"
import { AvailabilityEditorPage } from "@/pages/AvailabilityEditorPage"
import { AvailabilityListPage } from "@/pages/AvailabilityListPage"
import { DashboardLayout } from "@/pages/DashboardLayout"
import HostDashboard from "@/pages/HostDashboard"
import { LoginPage } from "@/pages/LoginPage"
import { MeetingTypeEditorPage } from "@/pages/MeetingTypeEditorPage"
import { MeetingTypeListPage } from "@/pages/MeetingTypeListPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { PublicBookingPage } from "@/pages/PublicBookingPage"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book/:slug" element={<PublicBookingPage />} />
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
          <Route
            path="/dashboard/meeting-types"
            element={<MeetingTypeListPage />}
          />
          <Route
            path="/dashboard/meeting-types/new"
            element={<MeetingTypeEditorPage />}
          />
          <Route
            path="/dashboard/meeting-types/:id"
            element={<MeetingTypeEditorPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
