import { useCallback, useEffect, useMemo, useState } from "react"

import {
  getCurrentHost,
  isUnauthorizedError,
  loginHost,
  logoutHost,
} from "@/api/auth"
import { HOST_SESSION_EXPIRED_EVENT } from "@/api/client"
import type { Host, LoginRequest } from "@/api/client"

import { AuthContext, type AuthStatus } from "./context"

type SessionResult = {
  host: Host | null
  status: Exclude<AuthStatus, "loading">
}

async function fetchSession(): Promise<SessionResult> {
  try {
    return { host: await getCurrentHost(), status: "authenticated" }
  } catch (error) {
    return {
      host: null,
      status: isUnauthorizedError(error) ? "unauthenticated" : "error",
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [host, setHost] = useState<Host | null>(null)

  useEffect(() => {
    let active = true

    fetchSession().then((result) => {
      if (!active) return
      setHost(result.host)
      setStatus(result.status)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleSessionExpired() {
      setHost(null)
      setStatus("unauthenticated")
    }

    window.addEventListener(
      HOST_SESSION_EXPIRED_EVENT,
      handleSessionExpired
    )

    return () => {
      window.removeEventListener(
        HOST_SESSION_EXPIRED_EVENT,
        handleSessionExpired
      )
    }
  }, [])

  const refreshSession = useCallback(async () => {
    setStatus("loading")
    const result = await fetchSession()
    setHost(result.host)
    setStatus(result.status)
  }, [])

  const login = useCallback(async (credentials: LoginRequest) => {
    const currentHost = await loginHost(credentials)
    setHost(currentHost)
    setStatus("authenticated")
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutHost()
    } finally {
      setHost(null)
      setStatus("unauthenticated")
    }
  }, [])

  const value = useMemo(
    () => ({ status, host, login, logout, refreshSession }),
    [status, host, login, logout, refreshSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
