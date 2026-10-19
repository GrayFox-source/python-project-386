# Спецификация системы бронирования встреч

**Статус:** draft для утверждения (не является финальной версией).
**Основание:** решения по тикетам #6, #7, #8; research #3 и #4; `GLOSSARY.md`; ADR-0001 и ADR-0002.
**Следующий шаг:** закрыть Open Questions (в первую очередь #5, #9–#14), затем утвердить спеку и разложить на тикеты реализации.

Термины домена используются в каноническом виде и с английскими именами: Host, Guest, Meeting Type, Availability, Weekly Window, Date Override, Slot, Buffer, Minimum Notice, Booking Horizon, Booking, Booking Page, Scheduling Link.

## Problem Statement

Host нужно публиковать ссылку, по которой Guest может выбрать удобное время и записаться на встречу. Сейчас у Host нет способа настроить типы встреч, расписание и получить управляемые заявки, а Guest не может видеть актуальные свободные слоты и не имеет безопасного способа посмотреть или отменить свою бронь.

При этом расписание повторяется по неделям, у Host бывают исключения и несколько типов встреч, Guest может находиться в другой таймзоне, а два Guest могут одновременно попытаться занять одно и то же время. Система должна корректно обрабатывать эти случаи, не создавая двойных броней и не теряя уже подтверждённые встречи.

## Solution

MVP — single-host приложение с двумя поверхностями:

1. **Authenticated Host dashboard** (`/dashboard/*`): управление Meeting Type, Availability и бронями.
2. **Public Booking Page** (`/book/{slug}`): просмотр слотов Meeting Type, создание брони и страница брони по гостевому токену.

Host заранее создаётся сидом, настраивает Availability и Meeting Type. Guest открывает Scheduling Link, видит слоты в своей таймзоне, оставляет имя, email и необязательный комментарий. Создаётся `pending` Booking; Host вручную подтверждает или отменяет её. Guest видит актуальный статус по токену и может отменить бронь до начала встречи. Слот удерживается `pending`-бронью до подтверждения или истечения TTL.

Все committed-времена хранятся и сравниваются как UTC-instants, а повторяющееся расписание — как wall-clock правила в IANA-таймзоне Availability. Уведомлений нет: «получить подтверждение» означает увидеть статус `confirmed` на странице брони.

## Scope и Non-goals

### В scope

- Один Host на инсталляцию; без команд и коллективного бронирования (ADR-0002).
- Вход Host (механизм финализируется в #5).
- CRUD Meeting Type со статусами `active` / `archived`.
- Host-scoped переиспользуемая Availability: недельные окна, date overrides, таймзона.
- Публичная выдача слотов с учётом броней, буферов, Minimum Notice и Booking Horizon.
- Создание Booking Guest'ом, ручное подтверждение Host'ом, отмена обеими сторонами, истечение `pending`.
- Защита от двойного бронирования и идемпотентность создания.
- Доступ Guest к своей брони по bearer-токену.
- Host dashboard и публичная Booking Page.

### Non-goals

- Команды, организации, участники, round-robin и collective booking.
- Оплата и биллинг.
- Синхронизация с внешними календарями (Google/Outlook) и `.ics`-приглашения.
- Email, push и SMS-уведомления, напоминания.
- Reschedule существующей брони.
- Динамические вопросы анкеты Meeting Type; в MVP только одно поле `comment`.
- Маркетинговый лендинг.
- Мультиязычность/i18n.
- Отдельный статус `no_show`.
- Дневные/недельные лимиты количества броней.
- Отдельный `Host.default_availability_id`.
- Автоматическое подтверждение броней.

## Domain model и инварианты

### Host

Владелец scheduling-страницы. В MVP ровно один Host на инсталляцию. У Host есть IANA-таймзона; она используется как значение по умолчанию для новой Availability и для отображения времени в кабинете. Точная модель аккаунта и аутентификации — #5.

### Meeting Type

Многоразовый шаблон бронирования, принадлежащий Host. Guest бронирует Slot конкретного Meeting Type, а не «сырое» время.

Инварианты:

- `slug` уникален без учёта регистра в рамках Host, включая архивные Meeting Type.
- Meeting Type ссылается ровно на одну Availability.
- Несколько Meeting Type могут ссылаться на одну Availability.
- `status ∈ {active, archived}`; отдельного soft-delete нет.
- `archived` блокирует новые брони, но существующие Booking остаются валидными и управляемыми.
- Hard delete разрешён только при отсутствии Booking; иначе `409`.
- Удаление Meeting Type не удаляет Availability.
- Правки Meeting Type видны в существующих Booking, потому что Booking не снапшотит `title`, `description`, `format` и `location`.
- Booking фиксирует собственные `starts_at` / `ends_at`; изменение `duration_minutes` не меняет длительность уже созданной Booking.

### Availability

Host-scoped именованный переиспользуемый ресурс, задающий, когда принимаются брони.

Инварианты:

- Availability принадлежит одному Host и имеет обязательную IANA-таймзону.
- Weekly Windows и Date Overrides интерпретируются в таймзоне Availability.
- Weekly Window задаётся днём недели (`Mon=1 … Sun=7`) и локальным интервалом `HH:MM`.
- У дня может быть несколько интервалов; интервалы внутри дня не пересекаются, смежные разрешены.
- Окно не пересекает полночь; `end > start`. `24:00` разрешён только как конец интервала и означает локальную полночь той же даты.
- Пустой день — выходной.
- Date Override заменяет Weekly Windows для одной локальной даты. Override бывает `closed` либо содержит собственные интервалы.
- На одну дату допускается один Override.
- Пустая Availability валидна и означает «броней нет».
- Смена таймзоны переинтерпретирует те же wall-clock окна в новой зоне; существующие Booking остаются неизменными instants.
- Редактирование Availability применяется немедленно к будущей генерации слотов. Существующие Booking не меняются и не отменяются, даже если их время выпало из новых окон.

### Slot, Buffer, Minimum Notice, Booking Horizon

- Slot — конкретное время начала, выведенное из Availability после применения длительности, сетки, буферов, Minimum Notice, Booking Horizon и занятости.
- Capacity = 1 на всего Host: любые две активные Booking не пересекаются, в том числе у разных Meeting Type, с учётом буферов.
- Занятыми считаются Booking в статусах `pending` и `confirmed`. `cancelled` и `expired` не блокируют время.
- Buffer измеряется в реальных минутах и настраивается на Meeting Type.
- Буферы складываются симметрично: существующая Booking расширяется на `existing.before + new.after` до и `existing.after + new.before` после.
- Буферы не обрезают края окна Availability.
- Minimum Notice — минимальное реальное время между «сейчас» и началом Slot, настраивается на Meeting Type. Сравнение instant'ов, граница включительная.
- Booking Horizon — rolling-окно локальных дат в таймзоне Availability. Проверяется локальная дата начала, а не конца.
- Minimum Notice и Booking Horizon применяются одновременно; побеждает более строгое ограничение.

### Booking

Commitment Guest'а на конкретный Slot конкретного Meeting Type.

Инварианты:

- Booking создаётся только Guest'ом через публичную Booking Page.
- Статусы: `pending`, `confirmed`, `cancelled`, `expired`. `cancelled` и `expired` терминальны.
- `pending` удерживает Slot до подтверждения Host'ом или истечения TTL.
- Подтверждение только ручное, Host'ом.
- `expires_at = min(created_at + 24h, starts_at)`.
- Отмена разрешена Guest'у и Host'у до `starts_at`.
- После `starts_at` действия запрещены.
- Отмена терминальна; повторная запись создаёт новую Booking.
- `expired` освобождает Slot так же, как `cancelled`.
- Время хранится только как UTC-instants; `guest_timezone` не хранится.
- Guest-токен даёт доступ ровно к одной Booking.

## Research basis

Результаты research #3 (Cal.com) и #4 (таймзоны/DST) используются так:

- **Раздельная модель хранения.** Committed-времена (Booking, Slot на границе API) — UTC-instants; повторяющееся расписание — wall-clock + IANA-зона. Это совпадает с Cal.com и рекомендациями #4.
- **Одна сущность для окон и overrides.** Как и в Cal.com, Weekly Windows и Date Overrides можно хранить в одной таблице с дискриминатором и nullable-полями. Date Override заменяет окна даты; закрытый день представляется явным `closed`.
- **Таймзона расписания.** Cal.com хранит зону на Schedule и резолвит event → host → default. В нашей модели роль Schedule выполняет Availability: у неё собственная IANA-зона, а Meeting Type ссылается на неё. Зона Guest'а — только отображение.
- **Генерация слотов.** Из Cal.com берётся pipeline «раскрыть окна → вычесть занятость → пройти шагом `slot_interval` → отфильтровать notice/horizon». Буферы складываются симметрично, как в `getBusyTimes`.
- **Усиление конкурентности.** Cal.com не имеет жёсткого уникального ограничения на время брони и полагается на re-validation; в нашей спеке добавляется транзакция + частичный уникальный индекс. Это сознательное отличие.
- **DST.** Gap зажимается внутрь перехода, fold разрешается в раннее вхождение; окно, накрывающее повторяющийся час, даёт оба instant'а. Дедупликация — по instant. Это следствие PEP 495 и рекомендаций #4.
- **Wire format.** RFC 3339 UTC `Z` на выходе; naive/date-only входы отклоняются; группировка по датам — в зоне отображения, с расширением диапазона на ±1 день.
- **Не берём из Cal.com:** несколько Schedule на пользователя, travel schedules, calendar sync, seated events, slot reservations, rolling-window «N bookable days» и лимиты броней. В MVP — одна Availability на Meeting Type, rolling horizon в календарных днях и capacity 1.

## User Stories

### Host и доступ

1. Как Host, я хочу входить в кабинет под заранее созданным аккаунтом, чтобы управлять своими встречами.
   **Acceptance:** неавторизованный запрос к `/dashboard/*` и host-эндпоинтам не даёт доступа и перенаправляет/возвращает ошибку по решению #5; после входа доступен dashboard.

2. Как Host, я хочу выходить из аккаунта, чтобы завершить сессию.
   **Acceptance:** после logout защищённые страницы и эндпоинты недоступны; механизм отзыва сессии соответствует #5.

3. Как владелец инсталляции, я хочу создать единственного Host сидом/CLI из конфигурации, чтобы не строить регистрацию в MVP.
   **Acceptance:** повторный запуск сида не создаёт дубликат Host; credentials берутся из env; пароль хранится только в виде хеша.

### Meeting Type

4. Как Host, я хочу создать Meeting Type с названием, длительностью и форматом, чтобы Guest мог записаться на нужный тип встречи.
   **Acceptance:** обязательные поля валидируются; создаётся `active` Meeting Type; возвращается Scheduling Link.

5. Как Host, я хочу задать `description`, чтобы Guest понимал содержание встречи.
   **Acceptance:** `description` опционален, триммится, ограничен 2000 символами; пустая строка сохраняется как `null`.

6. Как Host, я хочу выбрать формат `online` или `offline`, чтобы указать способ проведения встречи.
   **Acceptance:** `format` обязателен и принимает только `online` / `offline`; дефолта на API нет, UI преселектит `online`.

7. Как Host, я хочу указать ссылку на встречу или адрес, чтобы Guest знал, где встречаться.
   **Acceptance:** `location` опционален, ≤500 символов; строгая проверка URL не выполняется; для `online` без `location` Booking Page показывает «Онлайн», для `offline` без `location` — «Место уточняется».

8. Как Host, я хочу, чтобы у Meeting Type был читаемый уникальный slug, чтобы получить короткую Scheduling Link.
   **Acceptance:** slug соответствует `[a-z0-9]+(-[a-z0-9]+)*`, длина 1–64; генерируется из `title` с транслитерацией кириллицы; при коллизии добавляется суффикс; ручной конфликтующий slug даёт `409 slug_taken`.

9. Как Host, я хочу менять slug, чтобы исправить ссылку.
   **Acceptance:** slug редактируем; старая ссылка после смены отдаёт 404 без редиректа; UI предупреждает о последствиях.

10. Как Host, я хочу привязать Meeting Type к Availability, чтобы определить доступные для записи часы.
    **Acceptance:** `availability_id` обязателен; можно выбрать существующую Availability; при её отсутствии UI предлагает создать первую с предзаполнением Mon–Fri 09:00–17:00 в зоне Host.

11. Как Host, я хочу архивировать Meeting Type, чтобы снять его с публикации, не теряя историю.
    **Acceptance:** `archived` отдаёт 410 на Booking Page, блокирует новые Booking, но сохраняет существующие; архивный Meeting Type продолжает резервировать slug и считается использованием Availability.

12. Как Host, я хочу разархивировать Meeting Type, чтобы снова принимать брони по той же ссылке.
    **Acceptance:** `archived → active` разрешён; Scheduling Link снова работает; slug не меняется.

13. Как Host, я хочу удалить Meeting Type, у которого нет броней, чтобы убрать ошибочно созданную запись.
    **Acceptance:** при наличии Booking удаление возвращает `409`; при отсутствии — запись удаляется, slug освобождается, Availability остаётся.

14. Как Host, я хочу видеть активные и архивные Meeting Type раздельно, чтобы не путать их.
    **Acceptance:** две секции; сортировка внутри — `created_at DESC`; архивные визуально помечены и не показывают ссылку как активную.

15. Как Host, я хочу видеть Scheduling Link и копировать его, чтобы отправлять Guest'ам.
    **Acceptance:** ссылка имеет вид `{origin}/book/{slug}`; копирование доступно из списка и/или карточки Meeting Type.

### Availability

16. Как Host, я хочу создать именованную Availability в своей таймзоне, чтобы задать рабочее расписание.
    **Acceptance:** `name` обязателен, 1–100 после trim, уникален в рамках Host без учёта регистра; `timezone` обязателен и валидируется через IANA `ZoneInfo`.

17. Как Host, я хочу задавать несколько Weekly Windows на день, чтобы поддержать раздвоенные смены.
    **Acceptance:** несколько непересекающихся интервалов на день разрешены; смежные разрешены; дубликаты и пересечения отклоняются `422`; максимум 20 интервалов в день.

18. Как Host, я хочу оставлять день пустым, чтобы сделать его выходным.
    **Acceptance:** пустой день не даёт Slot'ов.

19. Как Host, я хочу задавать Date Override на конкретную дату, чтобы менять часы или закрывать день.
    **Acceptance:** Override заменяет Weekly Windows этой даты; вид `closed` закрывает день; вид с интервалами использует те же правила валидации; одна запись на дату.

20. Как Host, я хочу, чтобы Override в прошлом не ломал расписание, а Override за горизонтом начал действовать позже.
    **Acceptance:** прошлые Override инертны для генерации; будущие применяются с соответствующей даты.

21. Как Host, я хочу настроить Buffer до и после встречи, чтобы между встречами было время на подготовку.
    **Acceptance:** `buffer_before_minutes` / `buffer_after_minutes` — 0–120, default 0; буферы применяются симметрично к активным Booking.

22. Как Host, я хочу настроить Minimum Notice, чтобы не получать брони в последнюю минуту.
    **Acceptance:** `minimum_notice_minutes` — 0–10080, default 120; сравнение instant'ов, граница включительная.

23. Как Host, я хочу настроить Booking Horizon, чтобы ограничить, насколько далеко вперёд можно бронировать.
    **Acceptance:** `booking_horizon_days` — 1–365, default 60; локальные даты в зоне Availability от сегодня до `today + horizon` включительно.

24. Как Host, я хочу настроить шаг сетки Slot'ов, чтобы предлагать, например, получасовые старты при часовой встрече.
    **Acceptance:** `slot_interval_minutes` — 5–480, default равен `duration_minutes`; шаг независим от длительности.

25. Как Host, я хочу редактировать Availability в любой момент, чтобы менять расписание без потери броней.
    **Acceptance:** изменения применяются к будущей генерации немедленно; существующие Booking не меняются и не отменяются; API не блокирует редактирование из-за броней вне новых окон.

26. Как Host, я хочу получать предупреждение перед удалением используемой Availability.
    **Acceptance:** ответ Availability содержит `meeting_types_count`; DELETE при `meeting_types_count > 0` возвращает `409 availability_in_use`.

27. Как Host, я хочу удалить неиспользуемую Availability.
    **Acceptance:** hard delete разрешён только при `meeting_types_count = 0`; архивный Meeting Type считается использованием.

28. Как Host, я хочу редактировать Availability через полную замену расписания, чтобы не иметь дело с частичными PATCH-состояниями.
    **Acceptance:** `PUT` атомарно заменяет weekly + overrides; `PATCH` отсутствует; last write wins без ETag.

### Публичная Booking Page и слоты

29. Как Guest, я хочу открыть Scheduling Link и увидеть Meeting Type, чтобы понять, на что записываюсь.
    **Acceptance:** страница показывает title, description, duration, format, location; для архивного типа — состояние 410; для неизвестного slug — 404.

30. Как Guest, я хочу видеть доступные Slot'ы в своём часовом поясе, чтобы выбрать удобное время.
    **Acceptance:** время показывается в IANA-зоне браузера с явной подписью зоны; слоты сгруппированы по датам в зоне отображения; дни без слотов отсутствуют.

31. Как Guest, я хочу сменить таймзону отображения, чтобы планировать в привычном времени.
    **Acceptance:** выбор IANA-зоны доступен; смена зоны перезапрашивает/перерисовывает слоты; сервер не меняет расписание Host из-за зоны Guest.

32. Как Guest, я не хочу видеть несуществующие или повторяющиеся слоты на DST-переходах.
    **Acceptance:** spring-forward gap не даёт фантомных `02:xx`; fall-back fold даёт оба реальных instant'а, различимых по UTC-времени.

33. Как Guest, я хочу видеть только реально свободные Slot'ы, чтобы не выбирать занятое время.
    **Acceptance:** слоты учитывают активные Booking всех Meeting Type Host'а, Buffer'ы, Minimum Notice и Booking Horizon.

34. Как Guest, я хочу оставить имя, email и необязательный комментарий, чтобы Host знал, кто и зачем записался.
    **Acceptance:** `guest_name` и `guest_email` обязательны; email триммится и приводится к нижнему регистру; `comment` ≤1000; телефон не запрашивается; владение email не подтверждается.

35. Как Guest, я хочу получить понятную ошибку, если слот заняли между выбором и отправкой.
    **Acceptance:** конфликт возвращает `409 slot_unavailable` или `409 slot_taken`; UI показывает сообщение и обновляет список слотов.

36. Как Guest, я хочу видеть страницу успешной заявки, чтобы знать, что Booking создана.
    **Acceptance:** после создания показывается `pending` и Booking URL с токеном; plaintext-токен показывается один раз в ответе/на экране успеха.

### Booking lifecycle

37. Как Guest, я хочу, чтобы моя заявка ожидала подтверждения Host'а, чтобы Host мог проконтролировать запись.
    **Acceptance:** создаётся `pending`; Slot считается занятым; `expires_at = min(created_at + 24h, starts_at)`.

38. Как Host, я хочу видеть список всех броней, включая историю, чтобы управлять расписанием.
    **Acceptance:** видны `pending`, `confirmed`, `cancelled`, `expired`; у каждой — Guest, Meeting Type, время в зоне Host, `created_at`, `expires_at` и данные отмены.

39. Как Host, я хочу подтверждать `pending` Booking, чтобы Guest получил подтверждение.
    **Acceptance:** `pending → confirmed` разрешён только при `now < expires_at`; иначе `409 invalid_state_transition`; повторное подтверждение не меняет состояние.

40. Как Host, я хочу отменять `pending` и `confirmed` Booking до начала, чтобы освобождать время.
    **Acceptance:** отмена возможна при `now < starts_at`; сохраняются `cancelled_at`, `cancelled_by = host`, необязательная причина ≤500; Slot освобождается немедленно.

41. Как Guest, я хочу отменять свою бронь до начала, чтобы не занимать время Host'а.
    **Acceptance:** отмена по токену возможна для `pending` и `confirmed` при `now < starts_at`; `cancelled_by = guest`; после `starts_at` — `409 booking_started`.

42. Как Guest, я хочу видеть актуальный статус своей брони по ссылке, чтобы понимать, подтверждена ли она.
    **Acceptance:** по токену доступны только данные этой Booking; просмотр доступен до `starts_at + 7 дней`, затем 404; нельзя увидеть чужие брони или кабинет Host'а.

43. Как Host, я хочу, чтобы просроченные заявки автоматически освобождали время.
    **Acceptance:** `pending` с `expires_at <= now` лениво переводится в `expired` в начале читающего/меняющего запроса; отдельного cron нет; Slot освобождается.

44. Как Guest, я хочу, чтобы повторная запись после отмены создавала новую Booking, а не восстанавливала старую.
    **Acceptance:** `cancelled` и `expired` терминальны; новая запись на то же время — отдельная Booking.

45. Как Guest, я хочу, чтобы повторная отправка формы не создавала дубликат.
    **Acceptance:** `Idempotency-Key` живёт 24 часа; повтор с тем же ключом возвращает 200 с текущим состоянием исходной Booking; повтор с другим телом — `409 idempotency_key_reused`.

### Ошибки, приватность и безопасность

46. Как Guest, я хочу получать машиночитаемые коды ошибок, чтобы UI мог показать точное сообщение.
    **Acceptance:** ошибки содержат `code`; используются коды из раздела «Валидация и ошибки»; формат конверта финализируется в #12.

47. Как Guest, я не хочу, чтобы токен моей брони утекал через логи или Referer.
    **Acceptance:** URL с токеном не логируется; `Referrer-Policy: no-referrer`; HTTPS обязателен; в БД хранится только SHA-256-хеш токена.

48. Как Host, я не хочу, чтобы Guest мог читать или менять чужие брони.
    **Acceptance:** токен даёт доступ ровно к одной Booking; перебор токенов ограничивается rate limiting (детали — #13).

49. Как владелец системы, я хочу, чтобы двойное бронирование было невозможно даже при гонке.
    **Acceptance:** проверка выполняется в транзакции с блокировкой; есть частичный уникальный индекс `(host_id, starts_at) WHERE status IN ('pending','confirmed')`; проигравший получает `409 slot_taken`.

50. Как владелец системы, я хочу, чтобы времена корректно переживали DST и изменения IANA-правил.
    **Acceptance:** Booking хранится как instant; Availability пересчитывается из wall-clock + IANA; тесты покрывают gap, fold, 23/25-часовые дни.

## Implementation Decisions

### Модули

Будут созданы или расширены:

- **Domain: Meeting Type** — CRUD, slug, статусы, привязка Availability.
- **Domain: Availability** — недельные окна, overrides, валидация, backfill, подсчёт использований.
- **Domain: Slot generation** — раскрытие Availability в instants, вычитание занятости, буферы, notice, horizon, DST.
- **Domain: Booking** — жизненный цикл, переходы, истечение, отмена, идемпотентность, токен.
- **Persistence** — SQLAlchemy-модели, Alembic-миграции, транзакции и ограничения.
- **HTTP API** — host-эндпоинты (auth), публичные эндпоинты Booking Page, гостевые эндпоинты по токену.
- **Frontend: Host dashboard** — список Meeting Type, формы, редактор Availability, список броней.
- **Frontend: Booking Page** — выбор даты/слота, форма Guest'а, экран успеха, страница брони по токену.

### Meeting Type

Поля и правила:

| Поле | Обязательное | Правило |
| --- | --- | --- |
| `title` | да | 1–120 после trim |
| `description` | нет | ≤2000; пустая строка → `null` |
| `duration_minutes` | да | целое 5–480 |
| `format` | да | enum `online` \| `offline` |
| `location` | нет | ≤500; для `online` — ссылка, для `offline` — адрес; URL строго не валидируется |
| `slug` | да | `[a-z0-9]+(-[a-z0-9]+)*`, 1–64, уникален без учёта регистра |
| `availability_id` | да | FK на Availability |
| `status` | да | `active` \| `archived`, при создании `active` |
| `buffer_before_minutes` | да | 0–120, default 0 |
| `buffer_after_minutes` | да | 0–120, default 0 |
| `minimum_notice_minutes` | да | 0–10080, default 120 |
| `booking_horizon_days` | да | 1–365, default 60 |
| `slot_interval_minutes` | да | 5–480, default = `duration_minutes` |

Отдельного `meeting_url` нет: ссылка и адрес живут в `location`. `title` не уникален; различает `slug`.

Scheduling Link: `{origin}/book/{slug}`. Сегмент Host отсутствует (single-host, ADR-0002). Slug редактируем; при смене старая ссылка перестаёт работать без редиректа. Slug зарезервирован на всё время жизни записи, включая `archived`; освобождается после hard delete. Unarchive возвращает ту же ссылку.

> **Замечание о противоречии в #6.** В тикете #6 `buffer_*`, `minimum_notice_minutes`, `booking_horizon_days` и `slot_interval_minutes` перечислены в блоке валидации Availability. При этом `GLOSSARY.md` прямо определяет Buffer, Minimum Notice и Booking Horizon как настройки Meeting Type, а `slot_interval_minutes` по умолчанию равен длительности Meeting Type. Спека закрепляет эти поля за Meeting Type, чтобы модель была непротиворечивой и совпадала с research #3. Это решение нужно подтвердить при закрытии #11/#12.

### Availability

Поля:

- `name`: 1–100 после trim; уникален в рамках Host без учёта регистра.
- `timezone`: обязательный IANA-идентификатор; неизвестная зона → `422 invalid_timezone`.
- `weekly`: объект по дням `Mon=1 … Sun=7`; значение — список интервалов `HH:MM`.
- `overrides`: массив записей на конкретные локальные даты; `closed` xor интервалы.

Правила времени:

- `HH:MM` с шагом 5 минут.
- `start < end`; минимальная длина интервала — 5 минут.
- Интервалы внутри дня не пересекаются; смежные разрешены; дубликаты запрещены.
- Максимум 20 интервалов в день.
- `24:00` разрешён как конец интервала («до локальной полуночи»); `start = 24:00` запрещён.
- Окно не обязано вмещать `duration_minutes`: слишком короткое окно просто не даёт Slot'ов.

Хранение (предварительно, финализируется в #11): одна таблица `availability_rules` с дискриминатором `kind = weekly | override`, nullable `day_of_week` / `date`, nullable `start_time` / `end_time`, флаг `is_closed` для override. Инварианты обеспечиваются CHECK-констрейнтами.

Создание, редактирование, удаление:

- `availability_id` обязателен при создании Meeting Type.
- Отдельного `Host.default_availability_id` нет; UI предвыбирает единственную Availability.
- Если Availability нет, UI предлагает создать первую с Mon–Fri 09:00–17:00 в зоне Host.
- Backfill при миграции: для каждого Host, у которого есть Meeting Type (включая архивные) и нет Availability, создать `Default` с Mon–Fri 09:00–17:00 в зоне Host (fallback UTC, если зона не задана) и привязать все Meeting Type. На пустой БД — no-op.
- Редактирование разрешено всегда; смена `timezone` переинтерпретирует wall-clock окна в новой зоне.
- Hard delete только при `meeting_types_count = 0`; иначе `409 availability_in_use`. Архивный Meeting Type считается использованием.

### Генерация слотов

Алгоритм:

1. Взять Availability, привязанную к Meeting Type.
2. Для каждой запрошенной локальной даты:
   - если есть Date Override — использовать его;
   - иначе развернуть Weekly Windows соответствующего дня недели.
3. Локализовать начала и концы окон в таймзоне Availability (instant'ы).
4. Собрать занятость: все активные Booking Host'а (`pending` и `confirmed`) по всем Meeting Type, расширенные буферами.
5. Вычесть занятые интервалы из окон.
6. Идти по каждому свободному окну с шагом `slot_interval_minutes` в реальном времени:
   - `start = window_start_instant + k * slot_interval`;
   - Slot валиден, если `start + duration_minutes <= window_end_instant`;
   - `end = start + duration_minutes`, точная длительность в реальных минутах.
7. Применить Minimum Notice: `slot.start >= now + minimum_notice_minutes`, граница включительная.
8. Применить Booking Horizon: локальная дата начала в зоне Availability от сегодня до `today + horizon` включительно; notice и horizon действуют одновременно.
9. Удалить дубликаты по instant, а не по локальной метке.
10. Сгруппировать по дате в зоне отображения Guest'а, отсортировать внутри дня.

Буферы:

- Существующая Booking расширяется на `existing.before + new.after` до и `existing.after + new.before` после.
- Буферы не обрезают края окна Availability.
- Если после редактирования Availability Booking выпала из окон, она всё равно остаётся занятой.

DST:

- **Gap (spring-forward):** начало окна, попавшее в gap, зажимается вперёд до первого валидного instant после перехода; конец — назад до instant перехода (эксклюзивно). Если после зажима `start >= end`, окно даёт ноль Slot'ов. Фантомных `02:xx` нет.
- **Fold (fall-back):** неоднозначная граница разрешается в раннее вхождение (`fold=0`). Окно, накрывающее повторяющийся час, открывает оба вхождения; дедупликация — по instant. Полный день на fall-back длится 25 часов.
- Примеры `America/New_York`:
  - 2026-03-08: `01:00–02:00` → 1 час; `02:00–04:00` → `03:00–04:00`; `02:00–03:00` → ноль.
  - 2026-11-01: окно `00:00–03:00` с шагом 30 минут даёт обе серии `01:00` / `01:30` с разными UTC-временами.
- Хранение: instants в UTC; повторяющиеся правила — wall-clock + IANA. IANA-зоны обязательны; offsets и аббревиатуры не принимаются как зоны.

### Booking lifecycle

Матрица переходов:

| Из | В | Кто | Условие |
| --- | --- | --- | --- |
| — | `pending` | Guest | Slot валиден; создаётся `expires_at` |
| `pending` | `confirmed` | Host | `now < expires_at` |
| `pending` | `cancelled` | Guest / Host | `now < starts_at` |
| `pending` | `expired` | system | `now >= expires_at` |
| `confirmed` | `cancelled` | Guest / Host | `now < starts_at` |
| `cancelled`, `expired` | — | — | терминальные |

Запрещены: `confirmed → pending`, `cancelled/expired → confirmed`, повторное подтверждение как смена состояния, любые действия после `starts_at`.

Истечение `pending`:

- `expires_at` хранится и индексируется.
- Переход в `expired` ленивый: в начале каждого запроса, читающего или меняющего Booking/Slot, в той же транзакции выполняется `UPDATE ... WHERE status = 'pending' AND expires_at <= now`.
- Фонового планировщика нет.
- Просроченную заявку нельзя подтвердить, продлить или восстановить.
- `expired` освобождает Slot так же, как `cancelled`.

Отмена:

- `cancelled_at`, `cancelled_by ∈ {guest, host}`, необязательный `cancellation_reason` ≤500.
- Причина видна обеим сторонам.
- Для `expired` полей отмены нет — только `expires_at`.
- После отмены/истечения Slot освобождается немедленно; такие Booking не блокируют время и не учитываются в буферах.

### Создание Booking и защита от гонок

Сервер не доверяет клиенту. Порядок:

1. Валидация payload (Pydantic) → 422; naive/date-only `starts_at` запрещён.
2. Replay по `Idempotency-Key`.
3. Meeting Type по slug: неизвестный → `404 meeting_type_not_found`; архивный → `410 meeting_type_archived`.
4. `starts_at` должен быть реально существующим Slot'ом: активная Availability, попадание в окно/override, выравнивание по сетке, вмещение длительности, Minimum Notice, Booking Horizon → иначе `409 slot_unavailable`.
5. Блокировка Host и проверка пересечений с активными Booking и буферами → иначе `409 slot_taken`.
6. Вставка `pending` с `expires_at` и `ends_at`.

Конкурентность:

- Проверка и вставка — в одной транзакции.
- SQLite — `BEGIN IMMEDIATE`; Postgres — блокировка строки Host.
- Defense-in-depth: частичный уникальный индекс `(host_id, starts_at) WHERE status IN ('pending','confirmed')`. Ограничение `(meeting_type_id, starts_at)` недостаточно и не используется как основная защита.
- Проигравший гонку создания получает `409 slot_taken`.
- Гонка `confirm` / `cancel`: если первой закоммитилась отмена, подтверждение получает `409 invalid_state_transition`; если первым подтверждение, отмена всё ещё допустима.

Идемпотентность:

- `Idempotency-Key` опционален на уровне API, но фронтенд отправляет UUID всегда.
- Ключ живёт 24 часа.
- Повтор с тем же ключом возвращает `200` с текущим состоянием исходной Booking.
- Повтор с тем же ключом и другим телом → `409 idempotency_key_reused`.
- Без ключа повторный POST на занятый Slot → `409 slot_taken`.

### Гостевой токен и приватность

- Токен — 256-битный случайный bearer-секрет.
- В БД хранится только SHA-256-хеш.
- Plaintext показывается один раз в ответе на создание Booking вместе с Booking URL.
- Токен даёт доступ ровно к одной Booking; не является аутентификацией Guest'а и не даёт доступа к кабинету Host'а или другим броням.
- Просмотр и отмена — до `starts_at`; просмотр — до `starts_at + 7 дней`, затем 404.
- Токен не ротируется при отмене и не показывается Host'у; Host не может перевыпустить ссылку.
- URL с токеном не логируется; `Referrer-Policy: no-referrer`; HTTPS обязателен.
- Rate limiting публичных эндпоинтов — #13.

Видимость:

**Guest (страница по токену):** `title`, `description`, `duration_minutes`, `format`, `location`, собственные `guest_name` / `guest_email` / `comment`, `starts_at` / `ends_at` в текущей таймзоне браузера с явной IANA-подписью, статус, `created_at`, причина отмены Host'а, кнопка отмены, если действие разрешено. Не видит email/идентификаторы Host'а, другие Booking и внутренние id.

**Host (кабинет):** `guest_name`, `guest_email`, `comment`, статус, `starts_at` / `ends_at` в зоне Host'а, `created_at`, `expires_at`, `cancelled_by` / `cancelled_at` / причина, Meeting Type. Видит все Booking, включая `cancelled` и `expired`.

### API contract

Общие правила:

- Входные timestamps — только RFC 3339 с `Z` или явным offset; naive/date-only отклоняются.
- Выходные `starts_at` / `ends_at` — RFC 3339 UTC `Z`.
- Поля таймзоны — IANA; сервер валидирует через `ZoneInfo`.
- Ошибки содержат машиночитаемый `code`; точный конверт — #12.

**Подтверждённые host-эндпоинты Availability:**

- `GET /hosts/me/availabilities`
- `POST /hosts/me/availabilities`
- `GET /hosts/me/availabilities/{id}`
- `PUT /hosts/me/availabilities/{id}`
- `DELETE /hosts/me/availabilities/{id}`

Тело: `name`, `timezone`, `weekly`, `overrides`. `PUT` полностью заменяет weekly + overrides атомарно; `PATCH` нет; last write wins без ETag. Ответ дополнительно содержит `meeting_types_count`.

**Подтверждённый публичный эндпоинт слотов:**

- `GET /book/{slug}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=IANA`

`from` / `to` — локальные даты в зоне отображения, включительно; `timezone` обязателен. Сервер расширяет раскрытие Availability на ±1 локальную дату, затем фильтрует по локальной дате Guest'а. Максимум 62 календарных дня за запрос, иначе `422 range_too_large`; `from > to` → 422. Даты за пределами horizon/notice не ошибка — пустой результат. Архивный Meeting Type → 410; неизвестный slug → 404. Ответ сгруппирован по дате в зоне отображения; `start` / `end` — RFC 3339 UTC `Z`; `timezone` эхом; дни без слотов отсутствуют; слоты внутри дня отсортированы; пустой результат — `200` с пустым `days`. Fall-back слоты с одинаковой локальной меткой различаются UTC-временем.

**Предварительный host/guest-контур (финализируется в #12):**

- `GET/POST /hosts/me/meeting-types`
- `GET/PUT/DELETE /hosts/me/meeting-types/{id}`
- `POST /hosts/me/meeting-types/{id}/archive` и `/unarchive`
- `GET /hosts/me/bookings`
- `GET /hosts/me/bookings/{id}`
- `POST /hosts/me/bookings/{id}/confirm`
- `POST /hosts/me/bookings/{id}/cancel`
- `GET /book/{slug}`
- `POST /book/{slug}/bookings`
- `GET /bookings/{token}`
- `POST /bookings/{token}/cancel`

Точные пути, методы архивации/unarchive, пагинация и форма ответов не считаются принятыми до закрытия #12.

## Data model (предварительно)

Точные типы, имена ограничений и индексы финализируются в #11. Логическая схема:

| Сущность | Ключевые поля | Примечания |
| --- | --- | --- |
| `hosts` | `id`, `email`, `password_hash`, `timezone`, `created_at` | Auth-поля зависят от #5; `timezone` — IANA |
| `availabilities` | `id`, `host_id`, `name`, `timezone`, `created_at`, `updated_at` | уникальность `name` в рамках Host без учёта регистра |
| `availability_rules` | `id`, `availability_id`, `kind`, `day_of_week`, `date`, `start_time`, `end_time`, `is_closed` | `kind = weekly \| override`; CHECK-инварианты |
| `meeting_types` | `id`, `host_id`, `availability_id`, `title`, `description`, `duration_minutes`, `format`, `location`, `slug`, `status`, `buffer_before_minutes`, `buffer_after_minutes`, `minimum_notice_minutes`, `booking_horizon_days`, `slot_interval_minutes`, `created_at`, `updated_at` | уникальность slug в рамках Host; архивные тоже участвуют |
| `bookings` | `id`, `host_id`, `meeting_type_id`, `guest_name`, `guest_email`, `comment`, `status`, `starts_at`, `ends_at`, `expires_at`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `idempotency_key`, `idempotency_key_expires_at`, `token_hash`, `created_at`, `updated_at` | `starts_at` / `ends_at` — UTC instants; частичный уникальный индекс `(host_id, starts_at) WHERE status IN ('pending','confirmed')` |
| `idempotency_keys` | `key`, `booking_id`, `request_hash`, `expires_at` | Либо отдельная таблица, либо поля в `bookings`; решает #11 |

Alembic-миграции должны включать backfill Availability для существующих Meeting Type (включая архивные). На пустой БД backfill — no-op.

## UI routes и flows

Согласно ADR-0001 — два дерева маршрутов.

### Host (authenticated)

- `/dashboard` — главная: ближайшие Booking, статусы, быстрые действия.
- `/dashboard/meeting-types` — список active/archived, создание, редактирование, архивация, копирование Scheduling Link.
- `/dashboard/meeting-types/new` и `/dashboard/meeting-types/{id}` — форма Meeting Type.
- `/dashboard/availability` и `/dashboard/availability/{id}` — список и редактор Availability: недельные окна, overrides, буферы/notice/horizon/шаг.
- `/dashboard/bookings` — список Booking с фильтрами, подтверждением, отменой и деталями Guest'а.
- `/dashboard/settings` — настройки Host (состав зависит от #5).
- `/login` — вход Host.

Точные пути и защита роутов финализируются в #9; UX-детали — в #16.

### Public

- `/book/{slug}` — Booking Page: Meeting Type, выбор даты/слота, форма Guest'а, подтверждение.
- Страница Booking по токену — путь финализируется в #12/#15; показывает статус, детали и действие отмены.
- 404 — неизвестный slug или несуществующая страница.
- Архивный Meeting Type — 410-состояние.

Booking Page flow:

1. Загрузка Meeting Type.
2. Загрузка слотов на выбранный диапазон в зоне браузера.
3. Выбор Slot'а.
4. Форма Guest'а.
5. POST создания Booking с `Idempotency-Key`.
6. Экран успеха с Booking URL и plaintext-токеном (показывается один раз).
7. Обработка `409 slot_taken` / `409 slot_unavailable`: сообщение и обновление слотов.

UX-детали (вид календаря, пустые состояния, мобильная версия, доступность) — #15 и #16.

## Валидация и ошибки

### Лимиты

- `title`: 1–120 после trim.
- `description`: ≤2000; пустая строка → `null`.
- `location`: ≤500.
- `duration_minutes`: целое 5–480.
- `comment`: ≤1000.
- `cancellation_reason`: ≤500.
- `slug`: 1–64, regex `[a-z0-9]+(-[a-z0-9]+)*`.
- `Availability.name`: 1–100, уникально в рамках Host без учёта регистра.
- Время: `HH:MM`, шаг 5 минут, `start < end`, минимум 5 минут, максимум 20 интервалов в день.
- `buffer_*`: 0–120.
- `minimum_notice_minutes`: 0–10080.
- `booking_horizon_days`: 1–365.
- `slot_interval_minutes`: 5–480.
- Диапазон слотов: ≤62 календарных дня.

### Коды ошибок

| HTTP | `code` | Когда |
| --- | --- | --- |
| 422 | `invalid_timezone` | Неизвестная/невалидная IANA-зона |
| 422 | `overlapping_windows` | Пересекающиеся интервалы в дне |
| 422 | `duplicate_override_date` | Несколько overrides на одну дату |
| 422 | `invalid_override` | Некорректный override (`closed` xor интервалы) |
| 422 | `range_too_large` | Диапазон слотов >62 дней или `from > to` |
| 422 | — | Ошибки валидации payload |
| 404 | `meeting_type_not_found` | Неизвестный Meeting Type |
| 404 | `booking_not_found` | Неизвестная Booking/токен |
| 404 | — | Неизвестный id Availability или Meeting Type |
| 409 | `availability_in_use` | Удаление используемой Availability |
| 409 | `slug_taken` | Ручной slug уже занят |
| 409 | `slot_unavailable` | Время не является валидным Slot'ом |
| 409 | `slot_taken` | Слот занят активной Booking |
| 409 | `idempotency_key_reused` | Тот же ключ идемпотентности с другим телом |
| 409 | `invalid_state_transition` | Недопустимый переход статуса |
| 409 | `booking_started` | Действие после `starts_at` |
| 410 | `meeting_type_archived` | Архивный Meeting Type |

Точный формат тела ошибки (поля, вложенность, список полевых деталей) — #12.

## NFR и безопасность

Подтверждено:

- Все таймзоны — IANA; offsets/аббревиатуры не принимаются.
- Сервер владеет генерацией Slot'ов; клиент только форматирует.
- Booking хранится как instant; Availability — wall-clock + IANA.
- `tzdata` добавляется в backend-зависимости для воспроизводимости.
- Guest-токен: 256 бит, SHA-256-хеш в БД, plaintext один раз.
- URL с токеном не логируется; `Referrer-Policy: no-referrer`; HTTPS обязателен.
- Email/push-уведомлений нет.
- Rate limiting, CORS, cookie-флаги, CSRF, retention, лимиты запросов и PII-логирование — #13.

Ориентиры:

- Backend: Python 3.14, FastAPI, SQLAlchemy 2.0, Alembic, SQLite с совместимой с Postgres схемой.
- Frontend: React + TypeScript + Vite + Tailwind v3 + shadcn/ui + React Router; слой данных — #9.
- Все проверки (lint + tests + build) должны проходить локально до push.

## Testing Decisions

### Принципы

Тестируется внешнее поведение, а не реализация. Не тестируются приватные функции, структура SQL-запросов и внутренние вызовы. Для времени «сейчас» подменяется фиксированным значением; DST-тесты запускаются с `TZ=UTC`.

### Предлагаемые швы

1. **Основной backend-шов — HTTP API.** FastAPI `TestClient` + временная SQLite-база. Через него проверяются CRUD, слоты, Booking lifecycle, ошибки, идемпотентность и токены. Это наивысший существующий шов; prior art — `backend/tests/test_health.py`.
2. **Доменный шов — чистая генерация слотов.** Функция/сервис, принимающий раскрытые окна, занятость, настройки и `now`, возвращающий Slot'ы. Нужен для DST-матрицы и границ без БД.
3. **Frontend-шов — страницы/компоненты верхнего уровня.** Рендер страницы с подменённым слоем данных; проверяются видимые состояния и действия пользователя. Prior art — `frontend/src/pages/HostDashboard.test.tsx`.

Швы 2 и 3 добавляются только потому, что DST-матрица и UI-состояния неудобно и дорого проверять exclusively через HTTP. Если при реализации удастся покрыть их через основной шов без потери качества — предпочтителен основной шов.

### Обязательные тест-кейсы

**Availability**

- Валидация имени, таймзоны, интервалов, перекрытий, `24:00`, overrides.
- Пустая Availability не даёт слотов.
- DELETE используемой Availability → 409; неиспользуемой → успех.
- Backfill на БД с Meeting Type без Availability.

**Slot generation**

- Обычный день, split shift, пустой день.
- Date Override `closed` и Override с интервалами.
- Слишком короткое окно не даёт Slot'ов.
- Шаг сетки отличается от длительности.
- Буферы складываются симметрично.
- Minimum Notice: граница включительная.
- Booking Horizon: локальная дата начала, границы включительные.
- Занятость от `pending` и `confirmed`; `cancelled` и `expired` не блокируют.
- DST spring-forward gap: окно внутри gap → ноль; частично пересекающее gap → зажим.
- DST fall-back fold: обе серии, дедупликация по instant.
- Полный день на transition: 23 и 25 часов.
- `Asia/Kolkata` (30-минутный offset), `Asia/Tokyo` (без DST).

**Booking**

- Создание `pending`, корректные `ends_at` и `expires_at`.
- Подтверждение Host'ом; запрет после `expires_at`.
- Отмена Guest'ом и Host'ом; запрет после `starts_at`.
- Ленивое истечение TTL и освобождение Slot'а.
- Повторная запись на освободившееся время.
- Гонка двух созданий: один успех, один `409 slot_taken`.
- Гонка confirm/cancel.
- Replay `Idempotency-Key`: то же тело → 200; другое тело → 409.
- Попытка брони вне окон, notice, horizon → `409 slot_unavailable`.
- Архивный Meeting Type → 410; неизвестный slug → 404.
- Доступ по токену: своя Booking, чужая/истёкшая → 404.
- Токен не логируется; в БД только хеш.

**API/контракт**

- Naive/date-only `starts_at` отклоняется.
- Неизвестная IANA-зона → `422 invalid_timezone`.
- Ответы слотов: группировка по дате, UTC `Z`, эхо `timezone`, пустой `days`.
- `from > to` и диапазон >62 дней → 422.
- Коды ошибок соответствуют таблице.

**Frontend**

- Dashboard: пустое состояние, список Meeting Type, архивные/активные.
- Форма Meeting Type: валидация, создание/редактирование.
- Редактор Availability: дни, окна, overrides, ошибки.
- Booking Page: загрузка, нет слотов, ошибка, `409 slot_taken`, успех с токеном.
- Страница Booking по токену: статусы, отмена, недоступность после срока.
- Локальные даты/время отображаются в выбранной IANA-зоне.

### Критерии готовности тикета реализации

- Есть минимальный unit/integration тест на новую бизнес-логику.
- `uv run pytest` и `uv run ruff check .` проходят в `/backend`.
- `npm run test`, `npm run lint`, `npm run build` проходят в `/frontend`.
- Проверяемые критерии приёмки из соответствующих User Stories выполнены.
- Миграции Alembic применяются на пустой БД и на БД с данными.

## Out of Scope

- Команды, коллективное бронирование, round-robin (ADR-0002).
- Оплата и биллинг.
- Синхронизация с внешними календарями и `.ics`.
- Email/push/SMS-уведомления и напоминания.
- Reschedule существующей Booking.
- Динамические вопросы Meeting Type.
- Маркетинговый лендинг (ADR-0001).
- Мультиязычность/i18n.
- Дневные/недельные лимиты броней.
- Отдельный `no_show`.
- Авто-подтверждение.
- `Host.default_availability_id`.

## Open Questions

Эти вопросы нужно закрыть до утверждения спеки и запуска `/to-tickets`.

1. **Host auth (#5).** Точный способ создания единственного Host (сид, CLI, env), алгоритм хеширования пароля, механизм сессии (JWT в httpOnly-cookie или серверная сессия), срок жизни, logout/отзыв, CSRF, поведение при 401 и редиректы. Также: обязательна ли IANA-таймзона у Host и как задаётся при сиде.
2. **Точный список эндпоинтов и API-контракт (#12).** Подтвердить host-эндпоинты Meeting Type и Booking, методы архивации/unarchive, пагинацию и фильтры, форму успешного ответа создания Booking, путь страницы Booking по токену, формат конверта ошибок, семантику `Idempotency-Key` на уровне HTTP и точные статусы.
3. **Схема БД (#11).** Точные типы и имена колонок, представление `24:00`, CHECK-констрейнты, отдельная таблица идемпотентности или поля в Booking, индексы для активных Booking, частичный уникальный индекс в SQLite и Postgres, стратегия backfill и миграций.
4. **Алгоритм генерации слотов (#10).** Формализовать вычитание пересекающихся окон, границы буферов, поведение при нескольких окнах и overrides, а также полную тест-матрицу DST. Базовые правила уже зафиксированы в этой спеке; #10 должен превратить их в однозначный алгоритм.
5. **Размещение scheduling-настроек.** Подтвердить, что `buffer_before_minutes`, `buffer_after_minutes`, `minimum_notice_minutes`, `booking_horizon_days`, `slot_interval_minutes` живут на Meeting Type, а не на Availability (в #6 они перечислены в блоке валидации Availability; GLOSSARY и research #3 говорят за Meeting Type).
6. **Frontend-архитектура (#9).** TanStack Query или тонкий fetch-клиент; правила кэширования/инвалидации; генерация типов из OpenAPI или ручные типы; auth guard; 404-роут; границы компонентов и роль shadcn/ui.
7. **UX Host dashboard (#16).** Прототип: компоновка dashboard, формы Meeting Type, редактор Availability, список и фильтры броней, пустые состояния и ошибки.
8. **UX Booking Page (#15).** Прототип: вид календаря (месяц/неделя/список), выбор таймзоны, мобильная версия, экран успеха, состояния `409`, `expired`, `cancelled`.
9. **NFR и безопасность (#13).** Rate limiting (лимиты и окна), CORS, cookie-флаги, CSRF, CSP, retention гостевых данных, запрет PII в логах, целевые показатели производительности/доступности и базовая доступность.
10. **Стратегия тестирования (#14).** Нужен ли e2e, минимальный набор интеграционных тестов, порог покрытия и точные критерии «тикет готов».
11. **Демо-данные, окружения и деплой.** Нужен ли демо-режим/сид для защиты проекта, какие env-переменные обязательны, как выполняются миграции на проде. Вопрос из «Not yet specified» карты #2.
12. **Приватность и retention гостевых данных.** Когда и как удаляются старые Booking и гостевые данные; влияет ли это на историю Host'а. Вопрос из карты #2.

## Further Notes

- «Получить подтверждение бронирования» в MVP означает увидеть статус `confirmed` на странице брони; писем и push-уведомлений нет.
- Guest-таймзона — только отображение. Она берётся из браузера (`Intl.DateTimeFormat().resolvedOptions().timeZone`) и может быть изменена; в Booking не сохраняется.
- Host видит время в своей таймзоне, Guest — в своей. Уникальность и защита от двойного бронирования сравнивают instants.
- Архивный Meeting Type продолжает занимать slug и считается использованием Availability.
- Правки Meeting Type и Availability не переписывают историю существующих Booking.
- Все решения по #6, #7, #8 и research #3/#4 перенесены сюда; противоречие по размещению scheduling-настроек явно вынесено в Open Questions.
- Спека намеренно не фиксирует точные пути файлов и фрагменты кода: они быстро устаревают. Исключение — таблицы полей, статусов и кодов ошибок, которые являются контрактом.
