import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import {
  createAvailability,
  getAvailability,
  removeAvailability,
  replaceAvailability,
} from "@/api/availability"
import type { Availability } from "@/api/client"
import { ApiRequestError } from "@/api/request"
import { useAuth } from "@/auth/use-auth"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  WEEKDAYS,
  availabilityErrors,
  availabilityToForm,
  emptyForm,
  formToWrite,
  type AvailabilityFieldErrors,
  type AvailabilityForm,
  type IntervalForm,
} from "@/domain/availability"

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/Moscow",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Almaty",
  "Asia/Tokyo",
]

function intervalLabel(day: string, index: number, part: "start" | "end") {
  const dayLabel =
    WEEKDAYS.find((weekday) => weekday.value === day)?.label ?? `День ${day}`
  return `${dayLabel}: ${part === "start" ? "начало" : "конец"} ${index + 1}`
}

export function AvailabilityEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === undefined || id === "new"
  const { host } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<AvailabilityForm>(() =>
    emptyForm(host?.timezone ?? "UTC")
  )
  const [existing, setExisting] = useState<Availability | null>(null)
  const [isLoading, setIsLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [fields, setFields] = useState<AvailabilityFieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew || !id) return

    let active = true
    getAvailability(id)
      .then((availability) => {
        if (!active) return
        setExisting(availability)
        setForm(availabilityToForm(availability))
      })
      .catch((loadFailure: unknown) => {
        if (!active) return
        if (
          loadFailure instanceof ApiRequestError &&
          loadFailure.status === 404
        ) {
          setNotFound(true)
          return
        }
        setLoadError("Не удалось загрузить расписание.")
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, isNew])

  function updateWeekly(day: string, intervals: IntervalForm[]) {
    setForm((current) => ({
      ...current,
      weekly: { ...current.weekly, [day]: intervals },
    }))
  }

  function updateInterval(
    day: string,
    index: number,
    patch: Partial<IntervalForm>
  ) {
    const intervals = (form.weekly[day] ?? []).map((interval, position) =>
      position === index ? { ...interval, ...patch } : interval
    )
    updateWeekly(day, intervals)
  }

  function addInterval(day: string) {
    updateWeekly(day, [
      ...(form.weekly[day] ?? []),
      { start: "09:00", end: "17:00" },
    ])
  }

  function removeInterval(day: string, index: number) {
    updateWeekly(
      day,
      (form.weekly[day] ?? []).filter((_, position) => position !== index)
    )
  }

  function updateOverride(
    index: number,
    patch: Partial<AvailabilityForm["overrides"][number]>
  ) {
    setForm((current) => ({
      ...current,
      overrides: current.overrides.map((override, position) =>
        position === index ? { ...override, ...patch } : override
      ),
    }))
  }

  function updateOverrideInterval(
    overrideIndex: number,
    intervalIndex: number,
    patch: Partial<IntervalForm>
  ) {
    const override = form.overrides[overrideIndex]
    if (!override) return

    updateOverride(overrideIndex, {
      intervals: override.intervals.map((interval, position) =>
        position === intervalIndex ? { ...interval, ...patch } : interval
      ),
    })
  }

  function addOverride() {
    setForm((current) => ({
      ...current,
      overrides: [
        ...current.overrides,
        {
          date: "",
          closed: false,
          intervals: [{ start: "09:00", end: "17:00" }],
        },
      ],
    }))
  }

  function removeOverride(index: number) {
    setForm((current) => ({
      ...current,
      overrides: current.overrides.filter(
        (_, position) => position !== index
      ),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFields({})
    setError(null)
    setIsSaving(true)

    try {
      const payload = formToWrite(form)
      if (isNew) {
        await createAvailability(payload)
      } else if (id) {
        await replaceAvailability(id, payload)
      }
      navigate("/dashboard/availability")
    } catch (saveError) {
      const mapped = availabilityErrors(saveError)
      setFields(mapped.fields)
      setError(mapped.general ?? null)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!id || isNew) return
    if (!window.confirm("Удалить расписание? Это действие необратимо.")) {
      return
    }

    setError(null)
    setIsDeleting(true)
    try {
      await removeAvailability(id)
      navigate("/dashboard/availability")
    } catch (deleteError) {
      const mapped = availabilityErrors(deleteError)
      setError(
        deleteError instanceof ApiRequestError &&
          deleteError.code === "availability_in_use"
          ? "Расписание используется Meeting Type и не может быть удалено."
          : mapped.general ?? "Не удалось удалить расписание."
      )
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <PageLoading message="Загружаем расписание…" />
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>Расписание не найдено</AlertTitle>
          <AlertDescription>
            Возможно, оно уже удалено.{" "}
            <Link className="underline" to="/dashboard/availability">
              Вернуться к списку
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>Ошибка загрузки</AlertTitle>
          <AlertDescription>
            {loadError}{" "}
            <Link className="underline" to="/dashboard/availability">
              Вернуться к списку
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Availability</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNew ? "Новое расписание" : "Редактирование расписания"}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/availability">К списку</Link>
        </Button>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Основные настройки</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="availability-name">Название</Label>
              <Input
                id="availability-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
              {fields.name && (
                <p className="text-sm text-destructive" role="alert">
                  {fields.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="availability-timezone">Таймзона</Label>
              <Input
                id="availability-timezone"
                list="timezone-options"
                value={form.timezone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timezone: event.target.value,
                  }))
                }
                required
              />
              <datalist id="timezone-options">
                {COMMON_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>
              {fields.timezone && (
                <p className="text-sm text-destructive" role="alert">
                  {fields.timezone}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Недельные окна</CardTitle>
            <CardDescription>
              Время указано в таймзоне расписания. Пустой день — выходной.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {fields.weekly && (
              <p className="text-sm text-destructive" role="alert">
                {fields.weekly}
              </p>
            )}

            {WEEKDAYS.map((day) => {
              const intervals = form.weekly[day.value] ?? []
              return (
                <section key={day.value} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-medium">{day.label}</h2>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addInterval(day.value)}
                    >
                      Добавить интервал
                    </Button>
                  </div>

                  {intervals.length === 0 && (
                    <p className="text-sm text-muted-foreground">Выходной</p>
                  )}

                  {intervals.map((interval, index) => (
                    <div
                      key={index}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <div className="space-y-1">
                        <Label htmlFor={`${day.value}-${index}-start`}>
                          Начало
                        </Label>
                        <Input
                          id={`${day.value}-${index}-start`}
                          aria-label={intervalLabel(day.value, index, "start")}
                          className="w-28"
                          placeholder="09:00"
                          value={interval.start}
                          onChange={(event) =>
                            updateInterval(day.value, index, {
                              start: event.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${day.value}-${index}-end`}>
                          Конец
                        </Label>
                        <Input
                          id={`${day.value}-${index}-end`}
                          aria-label={intervalLabel(day.value, index, "end")}
                          className="w-28"
                          placeholder="17:00"
                          value={interval.end}
                          onChange={(event) =>
                            updateInterval(day.value, index, {
                              end: event.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeInterval(day.value, index)}
                      >
                        Удалить интервал
                      </Button>
                    </div>
                  ))}
                </section>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Исключения по датам</CardTitle>
            <CardDescription>
              Override заменяет недельные окна выбранной даты.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.overrides && (
              <p className="text-sm text-destructive" role="alert">
                {fields.overrides}
              </p>
            )}

            {form.overrides.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Исключений нет — действуют недельные окна.
              </p>
            )}

            {form.overrides.map((override, overrideIndex) => (
              <div
                key={overrideIndex}
                className="space-y-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`override-${overrideIndex}-date`}>
                      Дата
                    </Label>
                    <Input
                      id={`override-${overrideIndex}-date`}
                      type="date"
                      value={override.date}
                      onChange={(event) =>
                        updateOverride(overrideIndex, {
                          date: event.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id={`override-${overrideIndex}-closed`}
                      checked={override.closed}
                      onCheckedChange={(checked) =>
                        updateOverride(overrideIndex, {
                          closed: checked === true,
                        })
                      }
                    />
                    <Label htmlFor={`override-${overrideIndex}-closed`}>
                      Выходной
                    </Label>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOverride(overrideIndex)}
                  >
                    Удалить исключение
                  </Button>
                </div>

                {!override.closed && (
                  <div className="space-y-2">
                    {override.intervals.map((interval, intervalIndex) => (
                      <div
                        key={intervalIndex}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div className="space-y-1">
                          <Label
                            htmlFor={`override-${overrideIndex}-${intervalIndex}-start`}
                          >
                            Начало
                          </Label>
                          <Input
                            id={`override-${overrideIndex}-${intervalIndex}-start`}
                            className="w-28"
                            placeholder="09:00"
                            value={interval.start}
                            onChange={(event) =>
                              updateOverrideInterval(
                                overrideIndex,
                                intervalIndex,
                                { start: event.target.value }
                              )
                            }
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`override-${overrideIndex}-${intervalIndex}-end`}
                          >
                            Конец
                          </Label>
                          <Input
                            id={`override-${overrideIndex}-${intervalIndex}-end`}
                            className="w-28"
                            placeholder="17:00"
                            value={interval.end}
                            onChange={(event) =>
                              updateOverrideInterval(
                                overrideIndex,
                                intervalIndex,
                                { end: event.target.value }
                              )
                            }
                            required
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateOverride(overrideIndex, {
                              intervals: override.intervals.filter(
                                (_, position) => position !== intervalIndex
                              ),
                            })
                          }
                        >
                          Удалить интервал
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateOverride(overrideIndex, {
                          intervals: [
                            ...override.intervals,
                            { start: "09:00", end: "17:00" },
                          ],
                        })
                      }
                    >
                      Добавить интервал
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addOverride}>
              Добавить исключение
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось сохранить</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {existing && existing.meeting_types_count > 0 && (
          <Alert>
            <AlertTitle>Расписание используется</AlertTitle>
            <AlertDescription>
              Оно привязано к {existing.meeting_types_count} Meeting Type.
              Удаление недоступно.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSaving || isDeleting}>
            {isSaving ? "Сохраняем…" : "Сохранить"}
          </Button>
          {!isNew && (
            <Button
              type="button"
              variant="destructive"
              disabled={
                isSaving ||
                isDeleting ||
                (existing?.meeting_types_count ?? 0) > 0
              }
              onClick={() => void handleDelete()}
            >
              {isDeleting ? "Удаляем…" : "Удалить"}
            </Button>
          )}
        </div>
      </form>
    </main>
  )
}
