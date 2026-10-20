import type { Host, LoginRequest } from "./client"
import { authLogin, authLogout, authMe } from "./client"

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(error: unknown, status: number) {
    const detail =
      typeof error === "object" && error !== null && "detail" in error
        ? (error.detail as { code?: string; message?: string })
        : undefined

    super(detail?.message ?? "Request failed")
    this.name = "ApiRequestError"
    this.status = status
    this.code = detail?.code
  }
}

function unwrap<T>(
  data: T | undefined,
  error: unknown,
  response: Response | undefined
): T {
  if (error || data === undefined) {
    throw new ApiRequestError(error, response?.status ?? 0)
  }

  return data
}

export async function loginHost(credentials: LoginRequest): Promise<Host> {
  const { data, error, response } = await authLogin({ body: credentials })
  return unwrap(data, error, response)
}

export async function logoutHost(): Promise<void> {
  const { error, response } = await authLogout()

  if (error) {
    throw new ApiRequestError(error, response?.status ?? 0)
  }
}

export async function getCurrentHost(): Promise<Host> {
  const { data, error, response } = await authMe()
  return unwrap(data, error, response)
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401
}
