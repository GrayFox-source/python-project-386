import type { ReactNode } from "react"

import { PageLoading } from "@/components/PageLoading"

import { SessionError } from "./SessionError"
import { useAuth } from "./use-auth"

export function AuthStatusGate({ children }: { children: ReactNode }) {
  const { status, refreshSession } = useAuth()

  if (status === "loading") {
    return <PageLoading message="Проверяем сессию…" />
  }

  if (status === "error") {
    return <SessionError onRetry={() => void refreshSession()} />
  }

  return <>{children}</>
}
