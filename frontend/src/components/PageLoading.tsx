export function PageLoading({ message = "Загрузка…" }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
      <p role="status" className="text-muted-foreground">
        {message}
      </p>
    </main>
  )
}
