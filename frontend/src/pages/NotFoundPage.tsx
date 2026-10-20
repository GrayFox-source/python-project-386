import { Link } from "react-router-dom"

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Страница не найдена
      </h1>
      <p className="mt-2 text-muted-foreground">
        Возможно, ссылка устарела или введена с ошибкой.
      </p>
      <Link className="mt-6 underline underline-offset-4" to="/dashboard">
        Перейти в кабинет
      </Link>
    </main>
  )
}
