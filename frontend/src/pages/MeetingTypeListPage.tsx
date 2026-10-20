import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import {
  archiveMeetingType,
  listMeetingTypes,
  removeMeetingType,
  unarchiveMeetingType,
} from "@/api/meeting-types"
import type { MeetingType } from "@/api/client"
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

function formatLabel(format: MeetingType["format"]) {
  return format === "online" ? "Онлайн" : "Оффлайн"
}

type MeetingTypeCardProps = {
  meetingType: MeetingType
  copied: boolean
  busy: boolean
  onCopy: (meetingType: MeetingType) => void
  onToggleArchive: (meetingType: MeetingType) => void
  onDelete: (meetingType: MeetingType) => void
}

function MeetingTypeCard({
  meetingType,
  copied,
  busy,
  onCopy,
  onToggleArchive,
  onDelete,
}: MeetingTypeCardProps) {
  const isArchived = meetingType.status === "archived"

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>
              <Link
                className="hover:underline"
                to={`/dashboard/meeting-types/${meetingType.id}`}
              >
                {meetingType.title}
              </Link>
            </CardTitle>
            <CardDescription className="mt-1">
              {meetingType.duration_minutes} мин ·{" "}
              {formatLabel(meetingType.format)}
            </CardDescription>
          </div>
          {isArchived && <Badge variant="secondary">Архив</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {meetingType.description && (
          <p className="text-sm text-muted-foreground">
            {meetingType.description}
          </p>
        )}

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Scheduling Link
          </p>
          {isArchived ? (
            <p className="break-all text-sm text-muted-foreground">
              {meetingType.scheduling_link}
            </p>
          ) : (
            <a
              className="break-all text-sm underline underline-offset-4"
              href={meetingType.scheduling_link}
              rel="noreferrer"
              target="_blank"
            >
              {meetingType.scheduling_link}
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={`/dashboard/meeting-types/${meetingType.id}`}>
              Редактировать
            </Link>
          </Button>
          {!isArchived && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onCopy(meetingType)}
            >
              {copied ? "Скопировано" : "Копировать ссылку"}
            </Button>
          )}
          <Button
            disabled={busy}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onToggleArchive(meetingType)}
          >
            {isArchived ? "Разархивировать" : "Архивировать"}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            type="button"
            variant="destructive"
            onClick={() => onDelete(meetingType)}
          >
            Удалить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

type MeetingTypeSectionProps = {
  title: string
  items: MeetingType[]
  emptyText: string
  copiedId: string | null
  busyId: string | null
  onCopy: (meetingType: MeetingType) => void
  onToggleArchive: (meetingType: MeetingType) => void
  onDelete: (meetingType: MeetingType) => void
}

function MeetingTypeSection({
  title,
  items,
  emptyText,
  copiedId,
  busyId,
  onCopy,
  onToggleArchive,
  onDelete,
}: MeetingTypeSectionProps) {
  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((meetingType) => (
            <MeetingTypeCard
              key={meetingType.id}
              meetingType={meetingType}
              copied={copiedId === meetingType.id}
              busy={busyId === meetingType.id}
              onCopy={() => onCopy(meetingType)}
              onToggleArchive={() => onToggleArchive(meetingType)}
              onDelete={() => onDelete(meetingType)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function MeetingTypeListPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    listMeetingTypes()
      .then((response) => {
        if (active) setMeetingTypes(response.items)
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить типы встреч.")
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  function load() {
    setIsLoading(true)
    setError(null)
    return listMeetingTypes()
      .then((response) => {
        setMeetingTypes(response.items)
      })
      .catch(() => {
        setError("Не удалось загрузить типы встреч.")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  function replaceMeetingType(updated: MeetingType) {
    setMeetingTypes((current) =>
      current.map((item) => (item.id === updated.id ? updated : item))
    )
  }

  async function copyLink(meetingType: MeetingType) {
    setActionError(null)
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard is unavailable")
      }
      await navigator.clipboard.writeText(meetingType.scheduling_link)
      setCopiedId(meetingType.id)
    } catch {
      setActionError("Не удалось скопировать ссылку.")
    }
  }

  async function toggleArchive(meetingType: MeetingType) {
    setActionError(null)
    setBusyId(meetingType.id)
    try {
      const updated =
        meetingType.status === "active"
          ? await archiveMeetingType(meetingType.id)
          : await unarchiveMeetingType(meetingType.id)
      replaceMeetingType(updated)
    } catch {
      setActionError("Не удалось изменить статус типа встречи.")
    } finally {
      setBusyId(null)
    }
  }

  async function deleteMeetingType(meetingType: MeetingType) {
    if (
      !window.confirm(
        `Удалить тип встречи «${meetingType.title}»? Это действие необратимо.`
      )
    ) {
      return
    }

    setActionError(null)
    setBusyId(meetingType.id)
    try {
      await removeMeetingType(meetingType.id)
      setMeetingTypes((current) =>
        current.filter((item) => item.id !== meetingType.id)
      )
    } catch {
      setActionError("Не удалось удалить тип встречи.")
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) {
    return <PageLoading message="Загружаем типы встреч…" />
  }

  const active = meetingTypes.filter(
    (meetingType) => meetingType.status === "active"
  )
  const archived = meetingTypes.filter(
    (meetingType) => meetingType.status === "archived"
  )
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Типы встреч
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Шаблоны встреч, которые гости открывают по Scheduling Link.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/meeting-types/new">Создать тип встречи</Link>
        </Button>
      </div>

      {error && (
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Ошибка загрузки</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>Не удалось выполнить действие</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {!error && meetingTypes.length === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Типов встреч пока нет</CardTitle>
            <CardDescription>
              Создайте первый тип встречи и привяжите его к расписанию.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/dashboard/meeting-types/new">
                Создать тип встречи
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && meetingTypes.length > 0 && (
        <>
          <MeetingTypeSection
            emptyText="Активных типов встреч нет."
            items={active}
            title="Активные"
            copiedId={copiedId}
            busyId={busyId}
            onCopy={(meetingType) => void copyLink(meetingType)}
            onToggleArchive={(meetingType) => void toggleArchive(meetingType)}
            onDelete={(meetingType) => void deleteMeetingType(meetingType)}
          />
          <MeetingTypeSection
            emptyText="Архив пуст."
            items={archived}
            title="Архив"
            copiedId={copiedId}
            busyId={busyId}
            onCopy={(meetingType) => void copyLink(meetingType)}
            onToggleArchive={(meetingType) => void toggleArchive(meetingType)}
            onDelete={(meetingType) => void deleteMeetingType(meetingType)}
          />
        </>
      )}
    </main>
  )
}
