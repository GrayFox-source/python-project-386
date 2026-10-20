import { useEffect, useState } from "react"
import type { FormEvent } from "react"

import {
  BOOKING_STATUS_LABELS,
  cancelHostBooking,
  confirmHostBooking,
  listHostBookings,
} from "@/api/bookings"
import type { BookingStatus, HostBooking } from "@/api/client"
import { ApiRequestError } from "@/api/request"
import { useAuth } from "@/auth/use-auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import { Textarea } from "@/components/ui/textarea"
import {
  browserTimezone,
  formatDateTime,
} from "@/domain/timezones"

type Filter = BookingStatus | "all"
type ListState = "loading" | "ready" | "error"

function statusVariant(
  status: BookingStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "confirmed") return "default"
  if (status === "pending") return "secondary"
  if (status === "cancelled") return "destructive"
  return "outline"
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "booking_started") {
      return "Встреча уже началась, действие недоступно."
    }
    if (error.code === "invalid_state_transition") {
      return "Статус бронирования уже изменился. Обновите список."
    }
    return error.message
  }
  return "Не удалось выполнить действие."
}

export function HostBookingsPage() {
  const { host } = useAuth()
  const timezone = host?.timezone ?? browserTimezone()
  const [filter, setFilter] = useState<Filter>("all")
  const [bookings, setBookings] = useState<HostBooking[]>([])
  const [state, setState] = useState<ListState>("loading")
  const [reload, setReload] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")

  useEffect(() => {
    let active = true

    listHostBookings(filter === "all" ? {} : { status: filter })
      .then((response) => {
        if (!active) return
        setBookings(response.items)
        setState("ready")
      })
      .catch(() => {
        if (!active) return
        setState("error")
      })

    return () => {
      active = false
    }
  }, [filter, reload])

  function replaceBooking(updated: HostBooking) {
    setBookings((items) => {
      if (filter !== "all" && updated.status !== filter) {
        return items.filter((item) => item.id !== updated.id)
      }
      return items.map((item) =>
        item.id === updated.id ? updated : item
      )
    })
  }

  async function handleConfirm(id: string) {
    setPendingAction(`${id}:confirm`)
    setActionError(null)
    try {
      replaceBooking(await confirmHostBooking(id))
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleCancel(
    event: FormEvent<HTMLFormElement>,
    id: string
  ) {
    event.preventDefault()
    setPendingAction(`${id}:cancel`)
    setActionError(null)
    try {
      replaceBooking(await cancelHostBooking(id, cancelReason))
      setCancelId(null)
      setCancelReason("")
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  const filterLabels: Record<Filter, string> = {
    all: "Все бронирования",
    pending: "Ожидают подтверждения",
    confirmed: "Подтверждённые",
    cancelled: "Отменённые",
    expired: "Истёкшие",
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Бронирования
          </h1>
          <p className="text-sm text-muted-foreground">
            Подтверждайте заявки и управляйте историей встреч.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="booking-filter">Статус</Label>
            <Select
              value={filter}
              onValueChange={(value) => {
                setState("loading")
                setFilter(value as Filter)
              }}
            >
              <SelectTrigger id="booking-filter" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(filterLabels) as Filter[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {filterLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setState("loading")
              setReload((value) => value + 1)
            }}
          >
            Обновить
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось выполнить действие</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {state === "loading" && (
        <p className="text-sm text-muted-foreground" role="status">
          Загружаем бронирования…
        </p>
      )}

      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить бронирования</AlertTitle>
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
      )}

      {state === "ready" && bookings.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Бронирований с выбранным статусом нет.
          </CardContent>
        </Card>
      )}

      {state === "ready" && bookings.length > 0 && (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const isPending = booking.status === "pending"
            const isConfirmed = booking.status === "confirmed"
            const canCancel = isPending || isConfirmed
            const busy = pendingAction?.startsWith(`${booking.id}:`)

            return (
              <Card key={booking.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{booking.meeting_type_title}</CardTitle>
                    <Badge variant={statusVariant(booking.status)}>
                      {BOOKING_STATUS_LABELS[booking.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium">{booking.guest_name}</p>
                    <p className="text-muted-foreground">
                      {booking.guest_email}
                    </p>
                    <p>
                      {formatDateTime(booking.starts_at, timezone)} (
                      {timezone})
                    </p>
                    {isPending && (
                      <p className="text-muted-foreground">
                        Подтвердить до:{" "}
                        {formatDateTime(booking.expires_at, timezone)}
                      </p>
                    )}
                    {booking.comment && <p>{booking.comment}</p>}
                    {booking.status === "cancelled" && (
                      <p className="text-muted-foreground">
                        Отменено:{" "}
                        {booking.cancelled_by === "host" ? "Хост" : "Гость"}
                        {booking.cancellation_reason
                          ? ` · ${booking.cancellation_reason}`
                          : ""}
                      </p>
                    )}
                  </div>

                  {(isPending || canCancel) && (
                    <div className="flex flex-wrap gap-2">
                      {isPending && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => handleConfirm(booking.id)}
                        >
                          Подтвердить
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setCancelId(
                              cancelId === booking.id ? null : booking.id
                            )
                            setCancelReason("")
                          }}
                        >
                          Отменить
                        </Button>
                      )}
                    </div>
                  )}

                  {cancelId === booking.id && (
                    <form
                      className="space-y-2 border-t pt-3"
                      onSubmit={(event) =>
                        handleCancel(event, booking.id)
                      }
                    >
                      <Label htmlFor={`cancel-${booking.id}`}>
                        Причина отмены
                      </Label>
                      <Textarea
                        id={`cancel-${booking.id}`}
                        maxLength={500}
                        value={cancelReason}
                        onChange={(event) =>
                          setCancelReason(event.target.value)
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          type="submit"
                          variant="destructive"
                          disabled={busy}
                        >
                          {busy ? "Отменяем…" : "Подтвердить отмену"}
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setCancelId(null)}
                        >
                          Не отменять
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
