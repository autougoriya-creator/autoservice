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

## Что демострировать (этот срез)

1. Войти как **владелец** → справочники: Клиенты / Авто / Услуги (CRUD).
2. **Заказ-наряды** → создать из клиента + авто + услуг, сменить статус.
3. Открыть **Печать** (`/print/work-orders/[id]`) → «Печать / PDF» в браузере.
4. Войти как **клиент** → история показывает реальные заказ-наряды, привязанные к карточке клиента.

Также: лендинг, посты, запись (заглушки предыдущего среза), камеры «скоро live».

Склад и live-стрим камер **не** входят в этот срез.

## Полезные команды

```bash
npm run db:seed    # пересоздать демо-данные
npm run db:reset   # миграции с нуля + seed
npm run build      # production-сборка
```
