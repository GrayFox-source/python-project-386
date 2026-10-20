import { Navigate, Route, Routes } from "react-router-dom"

import { ProtectedRoute } from "@/auth/ProtectedRoute"
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
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
