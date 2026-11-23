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
| `staff@demo.local` | Персонал | `/owner` |
| `client@demo.local` | Клиент | `/client` |

Демо-тенант: **Автомойка Север** (`sever`).

## Что демострировать

1. Войти как **владелец** → **Рабочий стол** (`/owner/desk`) — интерактивная загрузка (drag, детали, новая запись).
2. Справочники: Клиенты / Авто / Услуги (CRUD).
3. **Заказ-наряды** → создать, сменить статус, **Печать**.
4. Войти как **клиент** → история заказ-нарядов.

Склад и live-стрим камер **не** входят в этот срез.

## Полезные команды

```bash
npm run db:seed    # пересоздать демо-данные
npm run db:reset   # миграции с нуля + seed
npm run build      # production-сборка
```
