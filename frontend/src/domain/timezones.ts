export const COMMON_TIMEZONES = [
  "UTC",
  "Europe/Moscow",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Almaty",
  "Asia/Kolkata",
  "Asia/Tokyo",
]

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function isoDateInTimezone(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(value)
}

export function nextLocalDates(
  value: Date,
  timeZone: string,
  count: number
): string[] {
  const [year, month, day] = isoDateInTimezone(value, timeZone)
    .split("-")
    .map(Number)
  const start = Date.UTC(year, month - 1, day)
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  )
}

export function supportedTimezones(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone")
    if (zones.length > 0) {
      return Array.from(new Set([...COMMON_TIMEZONES, ...zones]))
    }
  } catch {
    // Older browsers fall back to the common subset.
  }
  return [...COMMON_TIMEZONES]
}

export function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(date)
}

export function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}

export function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value))
}
