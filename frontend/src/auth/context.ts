import { createContext } from "react"

import type { Host, LoginRequest } from "@/api/client"

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error"

export interface AuthContextValue {
  status: AuthStatus
  host: Host | null
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
