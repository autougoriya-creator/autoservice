import { getSession, homeForRole } from "@/lib/auth";
import { BrandMark, ButtonLink } from "@/components/ui";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="grain relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="animate-wash pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-[linear-gradient(115deg,transparent_0%,rgba(20,33,43,0.88)_28%,rgba(20,33,43,0.96)_100%)] max-lg:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22800%22 viewBox=%220 0 800 800%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%23c45c26%22 stop-opacity=%220.35%22/%3E%3Cstop offset=%221%22 stop-color=%22%231a6b5c%22 stop-opacity=%220.2%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill=%22url(%23g)%22 d=%22M0 520c80-40 160-120 260-140s220 40 320 20 180-120 220-180v580H0z%22/%3E%3Cpath fill=%22none%22 stroke=%22rgba(255,255,255,0.08)%22 stroke-width=%222%22 d=%22M40 640c120-80 240-90 360-60s240 40 360-20%22/%3E%3Ccircle cx=%22620%22 cy=%22220%22 r=%2280%22 fill=%22none%22 stroke=%22rgba(255,255,255,0.1)%22 stroke-width=%2212%22/%3E%3Ccircle cx=%22620%22 cy=%22220%22 r=%2236%22 fill=%22rgba(196,92,38,0.35)%22/%3E%3C/svg%3E')] bg-cover bg-center opacity-90 max-lg:hidden"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <BrandMark className="text-xl text-[var(--ink)] sm:text-2xl" />
        <nav className="flex items-center gap-3">
          {session ? (
            <ButtonLink
              href={homeForRole(session.membership.role)}
              variant="dark"
            >
              В кабинет
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="ghost">
              Войти
            </ButtonLink>
          )}
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-20 pt-8 sm:px-6 lg:pb-28">
        <div className="max-w-xl">
          <p className="animate-rise text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            SaaS для автомоек и сервисов
          </p>
          <h1 className="animate-rise-delay brand-mark mt-4 text-5xl leading-[1.05] text-[var(--ink)] sm:text-6xl lg:text-7xl">
            Autoservice
          </h1>
          <p className="animate-rise-delay-2 mt-5 max-w-md text-lg leading-relaxed text-[var(--ink-soft)]">
            Запись клиентов, загрузка постов и личный кабинет с историей
            заказов — в одном сервисе для вашей точки.
          </p>
          <div className="animate-rise-delay-2 mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/login">Открыть демо</ButtonLink>
            <ButtonLink href="/login" variant="ghost">
              Войти как клиент
            </ButtonLink>
          </div>
        </div>

        <div className="mt-16 grid gap-8 border-t border-[var(--line)] pt-10 lg:hidden">
          <HeroVisualMobile />
        </div>
      </section>

      <aside className="absolute bottom-10 right-10 z-10 hidden max-w-sm text-right text-white/80 lg:block">
        <p className="animate-pulse-soft text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
          Демо-тенант
        </p>
        <p className="mt-2 font-medium text-white">Автомойка Север</p>
        <p className="mt-1 text-sm text-white/65">
          Владелец · персонал · клиент — готовые входы без пароля
        </p>
      </aside>
    </div>
  );
}

function HeroVisualMobile() {
  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--ink)] p-6 text-white shadow-[var(--shadow)]">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
        Операции точки
      </p>
      <p className="brand-mark mt-3 text-2xl">Посты · запись · ЛК</p>
      <p className="mt-3 text-sm text-white/70">
        Каркас MVP: мультитенантность, роли и экраны без склада и live-камер.
      </p>
    </div>
  );
}
