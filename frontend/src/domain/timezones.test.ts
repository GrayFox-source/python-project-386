import { describe, expect, it } from "vitest"

import { nextLocalDates, supportedTimezones } from "./timezones"

describe("nextLocalDates", () => {
  it("advances calendar dates across a spring-forward transition", () => {
    const now = new Date("2026-03-07T23:30:00-05:00")

    expect(nextLocalDates(now, "America/New_York", 3)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ])
  })

  it("advances calendar dates across a fall-back transition", () => {
    const now = new Date("2026-11-01T00:30:00-04:00")

    expect(nextLocalDates(now, "America/New_York", 3)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ])
  })

  it("uses the display timezone's local date", () => {
    const now = new Date("2026-01-05T23:30:00Z")

    expect(nextLocalDates(now, "Asia/Tokyo", 2)).toEqual([
      "2026-01-06",
      "2026-01-07",
    ])
  })
})

describe("supportedTimezones", () => {
  it("includes the full IANA list", () => {
    const zones = supportedTimezones()

    expect(zones).toContain("UTC")
    expect(zones).toContain("Europe/Moscow")
    expect(zones).toContain("Asia/Kolkata")
    expect(zones.filter((zone) => zone === "UTC")).toHaveLength(1)
  })
})
