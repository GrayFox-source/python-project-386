import type {
  MeetingType,
  MeetingTypeFormat,
  MeetingTypeWrite,
} from "@/api/client"
import { ApiRequestError } from "@/api/request"

export type MeetingTypeForm = {
  title: string
  description: string
  durationMinutes: string
  format: MeetingTypeFormat
  location: string
  slug: string
  availabilityId: string
  bufferBeforeMinutes: string
  bufferAfterMinutes: string
  minimumNoticeMinutes: string
  bookingHorizonDays: string
  slotIntervalMinutes: string
}

export type MeetingTypeFieldErrors = Partial<
  Record<
    | "title"
    | "description"
    | "duration_minutes"
    | "format"
    | "location"
    | "slug"
    | "availability_id"
    | "buffer_before_minutes"
    | "buffer_after_minutes"
    | "minimum_notice_minutes"
    | "booking_horizon_days"
    | "slot_interval_minutes",
    string
  >
>

const FIELDS = [
  "title",
  "description",
  "duration_minutes",
  "format",
  "location",
  "slug",
  "availability_id",
  "buffer_before_minutes",
  "buffer_after_minutes",
  "minimum_notice_minutes",
  "booking_horizon_days",
  "slot_interval_minutes",
] as const

const CODE_FIELDS: Record<string, keyof MeetingTypeFieldErrors> = {
  slug_taken: "slug",
  availability_not_found: "availability_id",
}

export function emptyMeetingTypeForm(
  availabilityId = ""
): MeetingTypeForm {
  return {
    title: "",
    description: "",
    durationMinutes: "30",
    format: "online",
    location: "",
    slug: "",
    availabilityId,
    bufferBeforeMinutes: "0",
    bufferAfterMinutes: "0",
    minimumNoticeMinutes: "120",
    bookingHorizonDays: "60",
    slotIntervalMinutes: "",
  }
}

export function meetingTypeToForm(meetingType: MeetingType): MeetingTypeForm {
  return {
    title: meetingType.title,
    description: meetingType.description ?? "",
    durationMinutes: String(meetingType.duration_minutes),
    format: meetingType.format,
    location: meetingType.location ?? "",
    slug: meetingType.slug,
    availabilityId: meetingType.availability_id,
    bufferBeforeMinutes: String(meetingType.buffer_before_minutes),
    bufferAfterMinutes: String(meetingType.buffer_after_minutes),
    minimumNoticeMinutes: String(meetingType.minimum_notice_minutes),
    bookingHorizonDays: String(meetingType.booking_horizon_days),
    slotIntervalMinutes: String(meetingType.slot_interval_minutes),
  }
}

function numberValue(value: string): number {
  return Number(value)
}

export function formToMeetingTypeWrite(
  form: MeetingTypeForm
): MeetingTypeWrite {
  const slug = form.slug.trim()
  const slotInterval = form.slotIntervalMinutes.trim()

  return {
    title: form.title,
    description: form.description,
    duration_minutes: numberValue(form.durationMinutes),
    format: form.format,
    location: form.location,
    slug: slug || undefined,
    availability_id: form.availabilityId,
    buffer_before_minutes: numberValue(form.bufferBeforeMinutes),
    buffer_after_minutes: numberValue(form.bufferAfterMinutes),
    minimum_notice_minutes: numberValue(form.minimumNoticeMinutes),
    booking_horizon_days: numberValue(form.bookingHorizonDays),
    slot_interval_minutes: slotInterval
      ? numberValue(slotInterval)
      : undefined,
  }
}

export function meetingTypeErrors(error: unknown): {
  fields: MeetingTypeFieldErrors
  general?: string
} {
  if (!(error instanceof ApiRequestError)) {
    return { fields: {}, general: "Не удалось сохранить тип встречи." }
  }

  const fields: MeetingTypeFieldErrors = {}
  if (error.code && CODE_FIELDS[error.code]) {
    fields[CODE_FIELDS[error.code]] = error.message
  }

  for (const issue of error.issues) {
    const loc = issue.loc ?? []
    for (const field of FIELDS) {
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
