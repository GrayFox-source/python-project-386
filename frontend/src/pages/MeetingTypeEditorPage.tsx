import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { listAvailabilities } from "@/api/availability"
import type {
  Availability,
  MeetingType,
  MeetingTypeFormat,
} from "@/api/client"
import {
  createMeetingType,
  getMeetingType,
  replaceMeetingType,
} from "@/api/meeting-types"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  emptyMeetingTypeForm,
  formToMeetingTypeWrite,
  meetingTypeErrors,
  meetingTypeToForm,
  type MeetingTypeFieldErrors,
  type MeetingTypeForm,
} from "@/domain/meeting-type"

function FieldError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}

export function MeetingTypeEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === undefined || id === "new"
  const navigate = useNavigate()
  const [form, setForm] = useState<MeetingTypeForm>(() =>
    emptyMeetingTypeForm()
  )
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [existing, setExisting] = useState<MeetingType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fields, setFields] = useState<MeetingTypeFieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const availabilityResponse = await listAvailabilities()
        if (!active) return
        setAvailabilities(availabilityResponse.items)

        if (isNew) {
          setForm(emptyMeetingTypeForm(availabilityResponse.items[0]?.id))
          return
        }

        if (!id) return
        const meetingType = await getMeetingType(id)
        if (!active) return
        setExisting(meetingType)
        setForm(meetingTypeToForm(meetingType))
      } catch (loadFailure: unknown) {
        if (!active) return
        if (
          loadFailure instanceof ApiRequestError &&
          loadFailure.status === 404
        ) {
          setNotFound(true)
          return
        }
        setLoadError("Не удалось загрузить тип встречи.")
      } finally {
        if (active) setIsLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [id, isNew])

  function update<K extends keyof MeetingTypeForm>(
    key: K,
    value: MeetingTypeForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFields({})
    setError(null)
    setIsSaving(true)

    try {
      const payload = formToMeetingTypeWrite(form)
      if (isNew) {
        await createMeetingType(payload)
      } else if (id) {
        await replaceMeetingType(id, payload)
      }
      navigate("/dashboard/meeting-types")
    } catch (saveError) {
      const mapped = meetingTypeErrors(saveError)
      setFields(mapped.fields)
      setError(mapped.general ?? null)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <PageLoading message="Загружаем тип встречи…" />
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>Тип встречи не найден</AlertTitle>
          <AlertDescription>
            Возможно, он уже удалён.{" "}
            <Link className="underline" to="/dashboard/meeting-types">
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
            <Link className="underline" to="/dashboard/meeting-types">
              Вернуться к списку
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (availabilities.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Alert>
          <AlertTitle>Сначала создайте расписание</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Для типа встречи нужно выбрать Availability, по которому будут
              рассчитываться свободные слоты.
            </p>
            <Button asChild size="sm">
              <Link to="/dashboard/availability/new">
                Создать расписание
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Meeting Type</p>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isNew ? "Новый тип встречи" : "Редактирование типа встречи"}
            </h1>
            {existing?.status === "archived" && (
              <Badge variant="secondary">Архив</Badge>
            )}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/meeting-types">К списку</Link>
        </Button>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Основные настройки</CardTitle>
            <CardDescription>
              Название и описание увидит гость на странице записи.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meeting-type-title">Название</Label>
              <Input
                id="meeting-type-title"
                maxLength={120}
                required
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
              <FieldError message={fields.title} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meeting-type-description">Описание</Label>
              <Textarea
                id="meeting-type-description"
                maxLength={2000}
                rows={3}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
              <FieldError message={fields.description} />
            </div>

            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Формат</legend>
              <RadioGroup
                className="grid gap-3 sm:grid-cols-2"
                value={form.format}
                onValueChange={(value) =>
                  update("format", value as MeetingTypeFormat)
                }
              >
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <RadioGroupItem id="format-online" value="online" />
                  <Label htmlFor="format-online">Онлайн</Label>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <RadioGroupItem id="format-offline" value="offline" />
                  <Label htmlFor="format-offline">Оффлайн</Label>
                </div>
              </RadioGroup>
              <FieldError message={fields.format} />
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="meeting-type-duration">
                Длительность, мин
              </Label>
              <Input
                id="meeting-type-duration"
                max={480}
                min={5}
                required
                type="number"
                value={form.durationMinutes}
                onChange={(event) =>
                  update("durationMinutes", event.target.value)
                }
              />
              <FieldError message={fields.duration_minutes} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-type-location">Место</Label>
              <Input
                id="meeting-type-location"
                maxLength={500}
                placeholder="Ссылка на звонок или адрес"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
              />
              <FieldError message={fields.location} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meeting-type-slug">Slug</Label>
              <Input
                id="meeting-type-slug"
                maxLength={64}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="Оставьте пустым для автогенерации"
                value={form.slug}
                onChange={(event) => update("slug", event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Используется в Scheduling Link. Смена slug сделает старую
                ссылку недействительной.
              </p>
              <FieldError message={fields.slug} />
            </div>

            {existing && (
              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm font-medium">Scheduling Link</p>
                <p className="break-all text-sm text-muted-foreground">
                  {existing.scheduling_link}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Расписание</CardTitle>
            <CardDescription>
              Свободные слоты рассчитываются по выбранному Availability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RadioGroup
              className="grid gap-3 sm:grid-cols-2"
              value={form.availabilityId}
              onValueChange={(value) => update("availabilityId", value)}
            >
              {availabilities.map((availability) => (
                <div
                  key={availability.id}
                  className="flex items-center gap-2 rounded-md border p-3"
                >
                  <RadioGroupItem
                    id={`availability-${availability.id}`}
                    value={availability.id}
                  />
                  <div>
                    <Label htmlFor={`availability-${availability.id}`}>
                      {availability.name}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {availability.timezone}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
            <FieldError message={fields.availability_id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Параметры записи</CardTitle>
            <CardDescription>
              Ограничения показа слотов и буферы между встречами.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-type-buffer-before">
                Буфер до, мин
              </Label>
              <Input
                id="meeting-type-buffer-before"
                max={120}
                min={0}
                required
                type="number"
                value={form.bufferBeforeMinutes}
                onChange={(event) =>
                  update("bufferBeforeMinutes", event.target.value)
                }
              />
              <FieldError message={fields.buffer_before_minutes} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-type-buffer-after">Буфер после, мин</Label>
              <Input
                id="meeting-type-buffer-after"
                max={120}
                min={0}
                required
                type="number"
                value={form.bufferAfterMinutes}
                onChange={(event) =>
                  update("bufferAfterMinutes", event.target.value)
                }
              />
              <FieldError message={fields.buffer_after_minutes} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-type-notice">
                Минимальное уведомление, мин
              </Label>
              <Input
                id="meeting-type-notice"
                max={10080}
                min={0}
                required
                type="number"
                value={form.minimumNoticeMinutes}
                onChange={(event) =>
                  update("minimumNoticeMinutes", event.target.value)
                }
              />
              <FieldError message={fields.minimum_notice_minutes} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-type-horizon">
                Горизонт записи, дней
              </Label>
              <Input
                id="meeting-type-horizon"
                max={365}
                min={1}
                required
                type="number"
                value={form.bookingHorizonDays}
                onChange={(event) =>
                  update("bookingHorizonDays", event.target.value)
                }
              />
              <FieldError message={fields.booking_horizon_days} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meeting-type-slot-interval">
                Интервал слотов, мин
              </Label>
              <Input
                id="meeting-type-slot-interval"
                max={480}
                min={5}
                placeholder="Равен длительности"
                type="number"
                value={form.slotIntervalMinutes}
                onChange={(event) =>
                  update("slotIntervalMinutes", event.target.value)
                }
              />
              <FieldError message={fields.slot_interval_minutes} />
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось сохранить</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/dashboard/meeting-types">Отмена</Link>
          </Button>
        </div>
      </form>
    </main>
  )
}
