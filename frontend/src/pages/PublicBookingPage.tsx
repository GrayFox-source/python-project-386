import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"

import { getPublicMeetingType, listPublicSlots } from "@/api/booking-page"
import type { MeetingType, SlotDay } from "@/api/client"
import { ApiRequestError } from "@/api/request"
import { PageLoading } from "@/components/PageLoading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  browserTimezone,
  formatDateLabel,
  formatTime,
  nextLocalDates,
  supportedTimezones,
} from "@/domain/timezones"

const VISIBLE_DAYS = 14

type MetaState = "loading" | "ready" | "not-found" | "archived" | "error"
type SlotsState = "loading" | "ready" | "error"

type MetaResult =
  | { key: string; state: "ready"; meetingType: MeetingType }
  | { key: string; state: "not-found" | "archived" | "error" }

type SlotsResult = {
  key: string
  state: "ready" | "error"
  days: SlotDay[]
}

type Selection = {
  date: string
  start: string
}

function formatLabel(format: MeetingType["format"]): string {
  return format === "online" ? "Онлайн" : "Оффлайн"
}

export function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [now] = useState(() => new Date())
  const [timezone, setTimezone] = useState(() => browserTimezone())
  const [metaResult, setMetaResult] = useState<MetaResult | null>(null)
  const [slotsResult, setSlotsResult] = useState<SlotsResult | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [metaReload, setMetaReload] = useState(0)
  const [slotsReload, setSlotsReload] = useState(0)

  const dateRange = useMemo(
    () => nextLocalDates(now, timezone, VISIBLE_DAYS),
    [now, timezone]
  )
  const from = dateRange[0] ?? ""
  const to = dateRange[dateRange.length - 1] ?? ""

  const metaKey = `${slug ?? ""}:${metaReload}`
  const metaState: MetaState =
    metaResult?.key === metaKey ? metaResult.state : "loading"
  const meta =
    metaResult?.key === metaKey && metaResult.state === "ready"
      ? metaResult.meetingType
      : null

  const slotsKey = `${slug ?? ""}:${from}:${to}:${timezone}:${slotsReload}`
  const slotsState: SlotsState =
    slotsResult?.key === slotsKey ? slotsResult.state : "loading"
  const days =
    slotsResult?.key === slotsKey && slotsResult.state === "ready"
      ? slotsResult.days
      : []

  const timezoneOptions = useMemo(() => {
    const zones = supportedTimezones()
    return zones.includes(timezone) ? zones : [timezone, ...zones]
  }, [timezone])

  useEffect(() => {
    if (!slug) return

    let active = true

    getPublicMeetingType(slug)
      .then((meetingType) => {
        if (!active) return
        setMetaResult({ key: metaKey, meetingType, state: "ready" })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiRequestError && error.status === 404) {
          setMetaResult({ key: metaKey, state: "not-found" })
          return
        }
        if (error instanceof ApiRequestError && error.status === 410) {
          setMetaResult({ key: metaKey, state: "archived" })
          return
        }
        setMetaResult({ key: metaKey, state: "error" })
      })

    return () => {
      active = false
    }
  }, [slug, metaKey])

  useEffect(() => {
    if (!slug || metaState !== "ready" || !from || !to) return

    let active = true

    listPublicSlots(slug, from, to, timezone)
      .then((response) => {
        if (!active) return
        setSlotsResult({
          key: slotsKey,
          state: "ready",
          days: response.days,
        })
      })
      .catch(() => {
        if (!active) return
        setSlotsResult({ key: slotsKey, state: "error", days: [] })
      })

    return () => {
      active = false
    }
  }, [slug, metaState, from, to, timezone, slotsKey])

  if (!slug) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Тип встречи не найден</AlertTitle>
          <AlertDescription>
            Проверьте ссылку для записи и попробуйте снова.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (metaState === "loading") {
    return <PageLoading message="Загружаем страницу записи…" />
  }

  if (metaState === "not-found") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Тип встречи не найден</AlertTitle>
          <AlertDescription>
            Возможно, ссылка устарела или тип встречи был удалён.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (metaState === "archived") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert>
          <AlertTitle>Тип встречи архивирован</AlertTitle>
          <AlertDescription>
            Запись на этот тип встречи сейчас недоступна.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (metaState === "error" || !meta) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить тип встречи</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Проверьте подключение к серверу и повторите попытку.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMetaReload((value) => value + 1)}
            >
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const activeDate =
    selectedDate && days.some((day) => day.date === selectedDate)
      ? selectedDate
      : (days[0]?.date ?? null)
  const selectedSlotDay = selection
    ? days.find((day) => day.date === selection.date)
    : undefined

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {meta.title}
          </CardTitle>
          <CardDescription>
            {meta.description || "Выберите удобное время для встречи."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {meta.duration_minutes} мин · {formatLabel(meta.format)}
          </p>
          {meta.location && <p>{meta.location}</p>}
        </CardContent>
      </Card>

      <div className="mt-6 space-y-2">
        <Label htmlFor="booking-timezone">Ваша таймзона</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="booking-timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Время показано в выбранной таймзоне.
        </p>
      </div>

      <section className="mt-8 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Ближайшие 14 дней</h2>
          <p className="text-sm text-muted-foreground">
            Выберите подходящий слот.
          </p>
        </div>

        {slotsState === "loading" && (
          <p className="text-sm text-muted-foreground" role="status">
            Загружаем доступное время…
          </p>
        )}

        {slotsState === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось загрузить слоты</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Проверьте подключение к серверу и повторите попытку.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSlotsReload((value) => value + 1)}
              >
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {slotsState === "ready" && days.length === 0 && (
          <Alert>
            <AlertTitle>Нет доступных слотов</AlertTitle>
            <AlertDescription>
              На ближайшие 14 дней свободного времени нет. Попробуйте позже.
            </AlertDescription>
          </Alert>
        )}

        {slotsState === "ready" && days.length > 0 && (
          <div className="divide-y rounded-md border">
            {dateRange.map((date) => {
              const day = days.find((item) => item.date === date)
              const isActive = date === activeDate
              const slotCount = day?.slots.length ?? 0
              const hasSlots = slotCount > 0

              return (
                <div key={date}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex h-auto w-full justify-between gap-3 rounded-none px-4 py-3 text-left"
                    disabled={!hasSlots}
                    aria-expanded={isActive}
                    aria-controls={`slots-${date}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="font-medium capitalize">
                      {formatDateLabel(date)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {hasSlots ? `Свободно: ${slotCount}` : "Нет слотов"}
                    </span>
                  </Button>

                  {isActive && day && day.slots.length > 0 && (
                    <div
                      id={`slots-${date}`}
                      className="flex flex-wrap gap-2 px-4 pb-4"
                    >
                      {day.slots.map((slot) => {
                        const isSelected = selection?.start === slot.start
                        return (
                          <Button
                            key={slot.start}
                            size="sm"
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() =>
                              setSelection({ date, start: slot.start })
                            }
                          >
                            {formatTime(slot.start, timezone)}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {selection && selectedSlotDay && (
          <Alert>
            <AlertTitle>Выбрано время</AlertTitle>
            <AlertDescription>
              {formatDateLabel(selectedSlotDay.date)},{" "}
              {formatTime(selection.start, timezone)} ({timezone})
            </AlertDescription>
          </Alert>
        )}
      </section>
    </main>
  )
}
