import { prisma } from "@/lib/prisma";
import { workOrderTotal } from "@/lib/work-order";

export const PAYMENT_METHODS = [
  "CASH",
  "TERMINAL",
  "INVOICE",
  "CASH_AND_TERMINAL",
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

function dayBounds(anchor: Date) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

/** Сводка кассы за день: закрытые заказ-наряды с оплатой. */
export async function buildDailyCashSummary(
  organizationId: string,
  day = new Date(),
) {
  const { start, end } = dayBounds(day);

  const closed = await prisma.workOrder.findMany({
    where: {
      organizationId,
      status: "CLOSED",
    },
    include: {
      customer: true,
      vehicle: true,
      lines: true,
    },
    orderBy: { paidAt: "desc" },
  });

  const payments = closed.filter((wo) => {
    const t = wo.paidAt ?? wo.completedAt;
    if (!t || !wo.paymentMethod) return false;
    return t >= start && t <= end;
  });

  const byMethod: Record<
    PaymentMethodKey,
    { count: number; totalRub: number }
  > = {
    CASH: { count: 0, totalRub: 0 },
    TERMINAL: { count: 0, totalRub: 0 },
    INVOICE: { count: 0, totalRub: 0 },
    CASH_AND_TERMINAL: { count: 0, totalRub: 0 },
  };

  let totalRub = 0;
  const rows = payments.map((wo) => {
    const amount = workOrderTotal(wo.lines);
    const method = String(wo.paymentMethod) as PaymentMethodKey;
    if (byMethod[method]) {
      byMethod[method].count += 1;
      byMethod[method].totalRub += amount;
    }
    totalRub += amount;
    return {
      id: wo.id,
      number: wo.number,
      customerName: wo.customer.name,
      customerPhone: wo.customer.phone,
      vehiclePlate: wo.vehicle.plate,
      paymentMethod: method,
      amountRub: amount,
      paidAt: (wo.paidAt ?? wo.completedAt) as Date,
    };
  });

  return {
    start,
    end,
    totalRub,
    count: rows.length,
    byMethod,
    rows,
  };
}
