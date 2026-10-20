# Календарь звонков

Сервис для бронирования: Host настраивает расписание и типы встреч, Guest выбирает свободный слот на публичной странице.

Учебный проект Хекслета: https://ru.hexlet.io/programs/python

## Стек

- Backend: Python 3.14, FastAPI, SQLAlchemy 2.1, Alembic, SQLite.
- Frontend: React, TypeScript, Vite, Tailwind CSS v3, shadcn/ui, React Router.
- Контракт: TypeSpec → OpenAPI → Pydantic-модели и типизированный frontend SDK.

## Установка

```bash
git clone https://github.com/GrayFox-source/python-project-386.git
cd python-project-386
make setup
```

`make setup` устанавливает зависимости и генерирует OpenAPI-контракт, Pydantic-модели и frontend SDK.

## Переменные окружения

Скопируйте пример и задайте значения:

```bash
cp backend/.env.example backend/.env
```

Обязательные переменные:

- `JWT_SECRET` — секрет подписи JWT, не короче 32 символов.
- `HOST_EMAIL`, `HOST_PASSWORD` — credentials единственного Host.
- `HOST_TIMEZONE` — IANA-таймзона Host.
- `DATABASE_URL` — строка подключения SQLAlchemy.
- `ENVIRONMENT` — `development` или `production`; в production cookie сессии получает флаг `Secure`.
- `CORS_ORIGINS` — разрешённые origin фронтенда через запятую.
- `PUBLIC_BASE_URL` — публичный адрес фронтенда для Scheduling Link.

## Backend

```bash
cd backend
uv sync --dev
uv run alembic upgrade head
uv run python -m app.seed
uv run uvicorn main:app --reload
```

Повторный запуск seed обновляет существующего Host и не создаёт дубликат. Пароль хранится только как Argon2id-хеш.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

По умолчанию фронтенд обращается к `http://localhost:8000`. Другой адрес можно задать через `VITE_API_BASE_URL`.

## Деплой на Render

В корне лежит `render.yaml` — Blueprint для одного Docker-сервиса: бэкенд раздаёт собранный фронтенд и API с одного домена.

1. В Render выберите **New → Blueprint** и подключите репозиторий.
2. Заполните секреты `HOST_EMAIL`, `HOST_PASSWORD` и `PUBLIC_BASE_URL` (например, `https://booking-calendar.onrender.com`). `JWT_SECRET` генерируется автоматически.
3. Примените Blueprint: Render соберёт `Dockerfile`, подключит диск к `/data` и запустит сервис.

При старте контейнера выполняются `alembic upgrade head` и seed Host, затем запускается uvicorn. SQLite хранится в `/data/booking.db`, поэтому нужен платный план с диском (`starter` и выше): на free-плане данные теряются при каждом деплое или рестарте.

## Генерация API

После изменения `api-spec/main.tsp`:

```bash
make generate
```

Команда обновляет `api-spec/openapi.yaml`, Pydantic-модели в `backend/generated` и типизированный SDK в `frontend/src/api/generated`.

## Проверки

```bash
cd backend && uv run ruff check . && uv run pytest
cd frontend && npm run test && npm run lint && npm run build
make check-contract
```

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

Хекслет — школа программирования для людей, которые хотят освоить IT-профессию. Этот репозиторий — один из учебных проектов.
