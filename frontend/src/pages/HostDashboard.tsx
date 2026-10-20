import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Booking } from "@/domain/types"

const upcomingBookings: Booking[] = []

export default function HostDashboard() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Кабинет Хоста</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Ближайшие бронирования</CardTitle>
          <CardDescription>
            Бронирования гостей на ближайшее время
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingBookings.length === 0 && (
            <p className="text-muted-foreground">Ближайших бронирований нет</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/dashboard/meeting-types/new">Создать тип встречи</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/dashboard/bookings">Все бронирования</Link>
        </Button>
        <Button variant="outline">Настройки</Button>
      </div>
    </main>
  )
}
