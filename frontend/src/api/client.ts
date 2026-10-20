import { client } from "./generated/client.gen"

export const HOST_SESSION_EXPIRED_EVENT = "host-session-expired"

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  credentials: "include",
})

client.interceptors.response.use((response) => {
  if (response.status === 401 && typeof window !== "undefined") {
    const path = response.url
      ? new URL(response.url, window.location.origin).pathname
      : ""

    if (path !== "/auth/login") {
      window.dispatchEvent(new Event(HOST_SESSION_EXPIRED_EVENT))
    }
  }

  return response
})

export { client }
export * from "./generated"
