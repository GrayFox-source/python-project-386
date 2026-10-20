import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useParams } from "react-router-dom"

import {
  BOOKING_STATUS_LABELS,
  cancelGuestBooking,
  getGuestBooking,
} from "@/api/bookings"
import type { BookingStatus, GuestBookingView } from "@/api/client"
import { ApiRequestError } from "@/api/request"
import { PageLoading } from "@/components/PageLoading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { browserTimezone, formatDateTime } from "@/domain/timezones"

type PageState = "loading" | "ready" | "not-found" | "error"

function statusVariant(
  status: BookingStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed") return "default"
  if (status === "pending") return "secondary"
  if (status === "cancelled") return "destructive"
  return "outline"
}

function formatLabel(format: GuestBookingView["meeting_type"]["format"]) {
  return format === "online" ? "Онлайн" : "Оффлайн"
}

export function BookingStatusPage() {
  const { token } = useParams<{ token: string }>()
  const [timezone] = useState(() => browserTimezone())
  const [now] = useState(() => Date.now())
  const [state, setState] = useState<PageState>("loading")
  const [booking, setBooking] = useState<GuestBookingView | null>(null)
  const [reload, setReload] = useState(0)
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    let active = true

    getGuestBooking(token)
      .then((value) => {
        if (!active) return
        setBooking(value)
        setState("ready")
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiRequestError && error.status === 404) {
          setState("not-found")
          return
        }
        setState("error")
      })

    return () => {
      active = false
    }
  }, [token, reload])

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    setCancelling(true)
    setCancelError(null)
    try {
      const updated = await cancelGuestBooking(token, reason)
      setBooking(updated)
    } catch (error) {
      setCancelError(
        error instanceof ApiRequestError
          ? error.message
          : "Не удалось отменить бронирование."
      )
    } finally {
      setCancelling(false)
    }
  }

  if (state === "loading") {
    return <PageLoading message="Загружаем бронирование…" />
  }

  if (!token || state === "not-found") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Бронирование не найдено</AlertTitle>
          <AlertDescription>
            Возможно, ссылка неверна или срок доступа к бронированию истёк.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (state === "error" || !booking) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить бронирование</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Проверьте подключение к серверу и повторите попытку.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setState("loading")
                setReload((value) => value + 1)
              }}
            >
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    new Date(booking.starts_at).getTime() > now

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle role="heading" aria-level={1}>
              {booking.meeting_type.title}
            </CardTitle>
            <Badge variant={statusVariant(booking.status)}>
              {BOOKING_STATUS_LABELS[booking.status]}
            </Badge>
          </div>
          <CardDescription>
            {booking.meeting_type.description ||
              "Детали вашего бронирования."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-medium">
            {formatDateTime(booking.starts_at, timezone)} ({timezone})
          </p>
          <p className="text-muted-foreground">
            {booking.meeting_type.duration_minutes} мин ·{" "}
            {formatLabel(booking.meeting_type.format)}
          </p>
          {booking.meeting_type.location && (
            <p className="text-muted-foreground">
              {booking.meeting_type.location}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ваши данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{booking.guest_name}</p>
          <p className="text-muted-foreground">{booking.guest_email}</p>
          {booking.comment && <p>{booking.comment}</p>}
          <p className="text-muted-foreground">
            Создано: {formatDateTime(booking.created_at, timezone)}
          </p>
        </CardContent>
      </Card>

      {booking.status === "cancelled" && (
        <Alert>
          <AlertTitle>Бронирование отменено</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>
              Кем: {booking.cancelled_by === "host" ? "Хост" : "Гость"}
            </p>
            {booking.cancelled_at && (
              <p>{formatDateTime(booking.cancelled_at, timezone)}</p>
            )}
            {booking.cancellation_reason && (
              <p>Причина: {booking.cancellation_reason}</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {booking.status === "expired" && (
        <Alert>
          <AlertTitle>Бронирование истекло</AlertTitle>
          <AlertDescription>
            Хост не подтвердил заявку вовремя. Вы можете выбрать новое время
            на странице записи.
          </AlertDescription>
        </Alert>
      )}

      {canCancel && (
        <Card>
          <CardHeader>
            <CardTitle>Отмена бронирования</CardTitle>
            <CardDescription>
              Отменить встречу можно до её начала.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCancel}>
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Причина отмены</Label>
                <Textarea
                  id="cancel-reason"
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              {cancelError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось отменить</AlertTitle>
                  <AlertDescription>{cancelError}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                variant="destructive"
                disabled={cancelling}
              >
                {cancelling ? "Отменяем…" : "Отменить встречу"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
