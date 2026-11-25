import { prisma } from "@/lib/prisma";
import { periodBounds, type PeriodKey } from "@/lib/payroll";
import { workOrderTotal } from "@/lib/work-order";

type LineLike = {
  serviceId?: string | null;
  name: string;
  priceRub: number;
  quantity: number;
};

/**
 * Сумма доп. услуг в ЗН относительно строк записи.
 * Совпадение: сначала serviceId, иначе имя; каждая строка записи «съедает» одну строку ЗН.
 */
export function upsellAmountFromLines(
  bookingLines: LineLike[],
  workOrderLines: LineLike[],
) {
  const remaining = workOrderLines.map((l) => ({ ...l }));
  for (const booked of bookingLines) {
    const idx = remaining.findIndex((wo) =>
      booked.serviceId && wo.serviceId
        ? booked.serviceId === wo.serviceId
        : booked.name === wo.name,
    );
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining.reduce(
    (sum, line) => sum + line.priceRub * line.quantity,
    0,
  );
}

/** Запись подходит под правило: самозапись ровно на одну услугу. */
export function isSingleServiceClientBooking(opts: {
  fromClient: boolean;
  lineCount: number;
}) {
  return opts.fromClient && opts.lineCount === 1;
}

export function adminUpsellBonusRub(
  upsellRub: number,
  bonusPercent: number,
) {
  if (upsellRub <= 0 || bonusPercent <= 0) return 0;
  return Math.round((upsellRub * Math.min(100, bonusPercent)) / 100);
}

export type AdminUpsellBonusRow = {
  workOrderId: string;
  number: number;
  completedAt: Date;
  bookingPlannedRub: number;
  workOrderTotalRub: number;
  upsellRub: number;
  bonusRub: number;
  bookedServiceName: string;
};

export type AdminUpsellBonusOpts = {
  /**
   * Окна смен администратора. Если заданы — учитываем только ЗН,
   * закрытые в эти интервалы (бонус за смену, не от поста админа).
   * Пустой массив = ноль бонуса. `undefined` = весь период.
   */
  shiftWindows?: { startsAt: Date; endsAt: Date }[];
};

function completedInShiftWindows(
  completedAt: Date,
  windows: { startsAt: Date; endsAt: Date }[],
) {
  return windows.some(
    (w) => completedAt >= w.startsAt && completedAt <= w.endsAt,
  );
}

/**
 * Бонус админу за допродажи: самозапись на 1 услугу → закрытый ЗН с доп. услугами.
 * Считается по закрытым ЗН за период/смены организации — без привязки к посту админа.
 * % задаёт OWNER на организации.
 */
export async function buildAdminUpsellBonus(
  organizationId: string,
  period: PeriodKey,
  anchor = new Date(),
  opts?: AdminUpsellBonusOpts,
) {
  const { start, end } = periodBounds(period, anchor);

  const org = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: { adminUpsellBonusPercent: true },
  });
  const bonusPercent = org?.adminUpsellBonusPercent ?? 0;

  const closed = await prisma.workOrder.findMany({
    where: {
      organizationId,
      status: "CLOSED",
      completedAt: { gte: start, lte: end },
    },
    include: {
      lines: true,
      sourceBooking: { include: { lines: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  const rows: AdminUpsellBonusRow[] = [];
  let upsellTotalRub = 0;
  let bonusTotalRub = 0;
  const shiftWindows = opts?.shiftWindows;

  for (const wo of closed) {
    const booking = wo.sourceBooking;
    if (!booking) continue;
    if (
      !isSingleServiceClientBooking({
        fromClient: booking.fromClient,
        lineCount: booking.lines.length,
      })
    ) {
      continue;
    }

    const completedAt = wo.completedAt ?? wo.updatedAt;
    if (shiftWindows !== undefined) {
      if (
        shiftWindows.length === 0 ||
        !completedInShiftWindows(completedAt, shiftWindows)
      ) {
        continue;
      }
    }

    const upsellRub = upsellAmountFromLines(booking.lines, wo.lines);
    if (upsellRub <= 0) continue;

    const bonusRub = adminUpsellBonusRub(upsellRub, bonusPercent);
    const woTotal = workOrderTotal(wo.lines);
    const bookingPlanned = booking.lines.reduce(
      (s, l) => s + l.priceRub * l.quantity,
      0,
    );

    rows.push({
      workOrderId: wo.id,
      number: wo.number,
      completedAt,
      bookingPlannedRub: bookingPlanned,
      workOrderTotalRub: woTotal,
      upsellRub,
      bonusRub,
      bookedServiceName: booking.lines[0]?.name ?? booking.serviceName,
    });
    upsellTotalRub += upsellRub;
    bonusTotalRub += bonusRub;
  }

  return {
    start,
    end,
    period,
    bonusPercent,
    rows,
    upsellTotalRub,
    bonusTotalRub,
  };
}
