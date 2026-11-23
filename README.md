# Autoservice

SaaS для автомоек и автосервисов: мультитенантность, справочники, заказ-наряды, кабинет клиента.

## Стек

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma 6 + SQLite для локального демо (схема готова к Postgres: смените `provider` и `DATABASE_URL`)

## Быстрый старт

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma generate
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

После `git pull` ветки с рабочим столом обязательно прогоните миграции и seed — иначе `/owner/desk` упадёт на старой схеме БД.

## Демо-вход (пароль не нужен)

На `/login` выберите роль — ставится cookie `autoservice_demo_user` на 14 дней.

| Email | Роль | Куда попадает |
| --- | --- | --- |
| `owner@demo.local` | Владелец | `/owner` |
| `staff@demo.local` | Мойщик (сделка 35%) | `/owner/my-work` |
| `washer@demo.local` | Мойщик (сделка 30%) | `/owner/my-work` |
| `mechanic@demo.local` | Слесарь (оклад) | `/owner/my-work` |
| `client@demo.local` | Клиент | `/client` |

Демо-тенант: **Автомойка Север** (`sever`).

## Что демострировать

1. Войти как **владелец** → **Рабочий стол** (`/owner/desk`) — интерактивная загрузка (drag, детали, новая запись).
2. **Персонал** / **График** / **Экономика** — закрепление за постом, смены, выручка vs ФОТ.
3. Справочники: Клиенты / Авто / Услуги (CRUD).
4. **Заказ-наряды** → создать, сменить статус, **Печать**.
5. Войти как **мойщик/слесарь** → **Моя смена** (график + оценка начисления).
6. Войти как **клиент** → история заказ-нарядов.

Склад и live-стрим камер **не** входят в этот срез.

## Полезные команды

```bash
npm run db:seed    # пересоздать демо-данные
npm run db:reset   # миграции с нуля + seed
npm run build      # production-сборка
```
