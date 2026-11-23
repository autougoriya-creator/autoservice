import { requireSession } from "@/lib/auth";
import { SectionTitle } from "@/components/ui";

export default async function ClientCamerasPage() {
  await requireSession(["CLIENT"]);

  return (
    <div>
      <SectionTitle
        eyebrow="Камеры"
        title="Зона обслуживания"
        description="Live-поток появится позже. Сейчас — только место в интерфейсе, чтобы интеграция не ломала кабинет."
      />

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink)] shadow-[var(--shadow)]">
        <div className="relative aspect-[16/9] w-full">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(196,92,38,0.25),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(26,107,92,0.3),transparent_40%),linear-gradient(160deg,#101820,#1a2a33)]"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="animate-pulse-soft rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Скоро live
            </span>
            <p className="brand-mark mt-4 text-3xl text-white sm:text-4xl">
              Трансляция пока недоступна
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65">
              Здесь будет live-камера зоны обслуживания. Источник потока
              подключим на этапе «Live-камеры» — без переделки кабинета.
            </p>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/45">
            <span>Камера 1 · бокс мойки</span>
            <span>offline</span>
          </div>
        </div>
      </div>
    </div>
  );
}
