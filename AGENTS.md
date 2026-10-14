# AGENTS.md

## Обзор проекта
Монорепозиторий: бекенд на Python (FastAPI + uv) и фронтенд на TypeScript (Vite + React + Tailwind v3 + shadcn/ui).

## Структура
- `/backend` – Python API. Зависимости управляются через `uv`.
- `/frontend` – UI приложение. Зависимости управляются через `npm`.

## Команды для запуска и проверки
### Backend (выполнять из папки `/backend`)
- `uv run uvicorn main:app --reload` – запуск dev-сервера.
- `uv run pytest` – прогон тестов.
- `uv run ruff check . --fix` – линтинг и автоисправление.

### Frontend (выполнять из папки `/frontend`)
- `npm run dev` – запуск dev-сервера Vite.
- `npm run test` – прогон тестов (Vitest + happy-dom).
- `npm run lint` – линтинг (ESLint).
- `npm run build` – продакшн-сборка.

## Строгие правила для агента
1. **Формат коммитов**: ВСЕГДА используй спецификацию Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). Без этого release-please не сгенерирует changelog.
   - Пример: `feat: add meeting creation endpoint`
   - Пример: `fix: resolve tailwind config typo`
2. **Тесты**: Любая новая бизнес-логика должна сопровождаться минимальным юнит- или интеграционным тестом.
3. **Зависимости**: 
   - Для Python используй ТОЛЬКО `uv add` или `uv add --dev`.
   - Для Node.js используй ТОЛЬКО `npm install` или `npm install -D`.
4. **UI компоненты**: При добавлении новых элементов интерфейса используй `npx shadcn@latest add <component>` вместо ручного написания стилей с нуля.
5. **Tailwind**: Используется версия 3.x. Не предлагай обновления до v4 без явного запроса.
6. **CI**: Все проверки (линтер + тесты) должны проходить локально до push. GitHub Actions запускается на каждый push в main и на каждый PR.
