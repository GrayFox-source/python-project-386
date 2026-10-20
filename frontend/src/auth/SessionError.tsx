import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function SessionError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            Не удалось проверить сессию
          </CardTitle>
          <CardDescription>
            Проверьте подключение к серверу и попробуйте снова.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry}>Повторить</Button>
        </CardContent>
      </Card>
    </main>
  )
}
