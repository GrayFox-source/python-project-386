import type { Availability, AvailabilityWrite } from "@/api/client"
import { ApiRequestError } from "@/api/request"

export type IntervalForm = {
  start: string
  end: string
}

export type OverrideForm = {
  date: string
  closed: boolean
  intervals: IntervalForm[]
}

export type AvailabilityForm = {
  name: string
  timezone: string
  weekly: Record<string, IntervalForm[]>
  overrides: OverrideForm[]
}

export type AvailabilityFieldErrors = Partial<
  Record<"name" | "timezone" | "weekly" | "overrides", string>
>

export const WEEKDAYS = [
  { value: "1", label: "Понедельник" },
  { value: "2", label: "Вторник" },
  { value: "3", label: "Среда" },
  { value: "4", label: "Четверг" },
  { value: "5", label: "Пятница" },
  { value: "6", label: "Суббота" },
  { value: "7", label: "Воскресенье" },
]

const CODE_FIELDS: Record<string, keyof AvailabilityFieldErrors> = {
  duplicate_availability_name: "name",
  invalid_timezone: "timezone",
  overlapping_windows: "weekly",
  duplicate_override_date: "overrides",
  invalid_override: "overrides",
}

export function emptyWeekly(): Record<string, IntervalForm[]> {
  return Object.fromEntries(WEEKDAYS.map((day) => [day.value, []]))
}

export function defaultWeekly(): Record<string, IntervalForm[]> {
  const weekly = emptyWeekly()
  for (const day of ["1", "2", "3", "4", "5"]) {
    weekly[day] = [{ start: "09:00", end: "17:00" }]
  }
  return weekly
}

export function emptyForm(timezone: string): AvailabilityForm {
  return {
    name: "",
    timezone,
    weekly: defaultWeekly(),
    overrides: [],
  }
}

export function availabilityToForm(
  availability: Availability
): AvailabilityForm {
  const weekly = emptyWeekly()
  for (const day of WEEKDAYS) {
    weekly[day.value] = (availability.weekly[day.value] ?? []).map(
      (window) => ({ start: window.start, end: window.end })
    )
  }

  return {
    name: availability.name,
    timezone: availability.timezone,
    weekly,
    overrides: availability.overrides.map((override) => ({
      date: override.date,
      closed: override.closed,
      intervals: (override.intervals ?? []).map((window) => ({
        start: window.start,
        end: window.end,
      })),
    })),
  }
}

export function formToWrite(form: AvailabilityForm): AvailabilityWrite {
  return {
    name: form.name,
    timezone: form.timezone,
    weekly: Object.fromEntries(
      WEEKDAYS.map((day) => [day.value, form.weekly[day.value] ?? []])
    ),
    overrides: form.overrides.map((override) =>
      override.closed
        ? { date: override.date, closed: true }
        : {
            date: override.date,
            closed: false,
            intervals: override.intervals,
          }
    ),
  }
}

export function availabilityErrors(error: unknown): {
  fields: AvailabilityFieldErrors
  general?: string
} {
  if (!(error instanceof ApiRequestError)) {
    return { fields: {}, general: "Не удалось сохранить расписание." }
  }

  const fields: AvailabilityFieldErrors = {}
  if (error.code && CODE_FIELDS[error.code]) {
    fields[CODE_FIELDS[error.code]] = error.message
  }

  for (const issue of error.issues) {
    const loc = issue.loc ?? []
    for (const field of ["name", "timezone", "weekly", "overrides"] as const) {
      if (loc.includes(field) && !fields[field]) {
        fields[field] = issue.msg ?? "Некорректное значение."
      }
    }
  }

  return {
    fields,
    general:
      Object.keys(fields).length === 0 ? error.message : undefined,
  }
}
