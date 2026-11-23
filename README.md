# Autoservice

SaaS-каркас для автомоек и автосервисов: мультитенантность, роли, демо-экраны владельца/персонала и личный кабинет клиента.

## Стек

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma 6 + SQLite для локального демо (схема готова к Postgres: смените `provider` и `DATABASE_URL`)

## Быстрый старт

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Демо-вход (пароль не нужен)

На `/login` выберите роль — ставится cookie `autoservice_demo_user` на 14 дней.

| Email | Роль | Куда попадает |
| --- | --- | --- |
| `owner@demo.local` | Владелец | `/owner` |
| `staff@demo.local` | Персонал | `/owner` |
| `client@demo.local` | Клиент | `/client` |

Демо-тенант: **Автомойка Север** (`sever`).

## Экраны MVP-среза

- `/` — лендинг (бренд Autoservice)
- `/login` — mock-вход
- `/owner` — обзор точки
- `/owner/posts` — заглушка доски загрузки постов
- `/owner/bookings` — заглушка записи
- `/client` — кабинет клиента
- `/client/orders` — история заказов
- `/client/cameras` — блок «скоро live»

Склад и реальный стриминг камер **не** входят в этот срез.

## Полезные команды

```bash
npm run db:seed    # пересоздать демо-данные
npm run db:reset   # миграции с нуля + seed
npm run build      # production-сборка
```
