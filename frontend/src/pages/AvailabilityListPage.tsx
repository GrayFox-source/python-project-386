import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { listAvailabilities } from "@/api/availability"
import type { Availability } from "@/api/client"
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

function weeklySummary(availability: Availability) {
  const activeDays = Object.values(availability.weekly).filter(
    (windows) => windows.length > 0
  )
  if (activeDays.length === 0) {
    return "Нет доступных окон"
  }

  const windowCount = activeDays.reduce(
    (total, windows) => total + windows.length,
    0
  )
  return `${activeDays.length} дн. · ${windowCount} интервалов`
}

export function AvailabilityListPage() {
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setIsLoading(true)
    setError(null)

    return listAvailabilities()
      .then((response) => {
        setAvailabilities(response.items)
      })
      .catch(() => {
        setError("Не удалось загрузить расписания.")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    let active = true

    listAvailabilities()
      .then((response) => {
        if (active) setAvailabilities(response.items)
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить расписания.")
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (isLoading) {
    return <PageLoading message="Загружаем расписания…" />
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Расписания</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Повторяющиеся окна и исключения, из которых складываются слоты.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/availability/new">Создать расписание</Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Ошибка загрузки</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!error && availabilities.length === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Расписаний пока нет</CardTitle>
            <CardDescription>
              Создайте первое расписание с окнами Пн–Пт 09:00–17:00.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/dashboard/availability/new">Создать расписание</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {availabilities.map((availability) => (
          <Card key={availability.id}>
            <CardHeader>
              <CardTitle>
                <Link
                  className="hover:underline"
                  to={`/dashboard/availability/${availability.id}`}
                >
                  {availability.name}
                </Link>
              </CardTitle>
              <CardDescription>
                {availability.timezone} · {weeklySummary(availability)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {availability.meeting_types_count === 0
                  ? "Не используется"
                  : `Используется: ${availability.meeting_types_count}`}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/availability/${availability.id}`}>
                  Редактировать
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
