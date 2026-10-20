import type { Host, LoginRequest } from "./client"
import { authLogin, authLogout, authMe } from "./client"
import { ApiRequestError, isUnauthorizedError, unwrap } from "./request"

export { ApiRequestError, isUnauthorizedError }

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
