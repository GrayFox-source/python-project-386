import { useState, type FormEvent } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { isUnauthorizedError } from "@/api/auth"
import { AuthStatusGate } from "@/auth/AuthStatusGate"
import { useAuth } from "@/auth/use-auth"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

type LoginLocationState = {
  from?: {
    pathname: string
    search: string
    hash: string
  }
}

export function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = location.state as LoginLocationState | null
  const target = state?.from
    ? `${state.from.pathname}${state.from.search}${state.from.hash}`
    : "/dashboard"

  if (status === "authenticated") {
    return <Navigate to={target} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
    } catch (loginError) {
      setError(
        isUnauthorizedError(loginError)
          ? "Неверный адрес электронной почты или пароль."
          : "Не удалось войти. Повторите попытку."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthStatusGate>
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              Вход в кабинет
            </CardTitle>
            <CardDescription>
              Войдите под аккаунтом Хоста, чтобы управлять расписанием и
              бронированиями.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Электронная почта</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось войти</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Вход…" : "Войти"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </AuthStatusGate>
  )
}
