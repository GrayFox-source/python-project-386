import { afterEach, describe, expect, it, vi } from "vitest"

import { getCurrentHost } from "./auth"
import { HOST_SESSION_EXPIRED_EVENT, client } from "./client"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("API client session handling", () => {
  it("uses a relative API base URL by default", () => {
    expect(client.getConfig().baseUrl).toBe("")
  })

  it("emits a session-expired event for a 401 response", async () => {
    const response = new Response(
      JSON.stringify({
        detail: { code: "unauthorized", message: "Not authenticated" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

    const listener = vi.fn()
    window.addEventListener(HOST_SESSION_EXPIRED_EVENT, listener)

    try {
      await expect(getCurrentHost()).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      })
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(HOST_SESSION_EXPIRED_EVENT, listener)
    }
  })
})
