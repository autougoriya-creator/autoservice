import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate, formatRub } from "@/lib/format";
import { EmptyStub, SectionTitle } from "@/components/ui";

export default async function ClientOrdersPage() {
  const session = await requireSession(["CLIENT"]);

  const orders = await prisma.order.findMany({
    where: {
      organizationId: session.membership.organization.id,
      clientId: session.id,
    },
    orderBy: { completedAt: "desc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="История"
        title="Заказы"
        description="Демо-история выполненных работ по вашему аккаунту в текущем тенанте."
      />

      {orders.length === 0 ? (
        <EmptyStub
          title="История пуста"
          description="Когда появятся завершённые визиты, они отобразятся здесь."
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white/85 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-[var(--ink)]">{order.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {formatDate(order.completedAt)}
                </p>
              </div>
              <p className="brand-mark text-lg text-[var(--ink)]">
                {formatRub(order.amountRub)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
