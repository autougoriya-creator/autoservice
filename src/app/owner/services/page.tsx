import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatRub } from "@/lib/format";
import { formatDuration } from "@/lib/work-order";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, EmptyStub, SectionTitle, StatusPill } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function ServicesPage() {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);

  const services = await prisma.service.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Справочник"
        title="Услуги"
        description="Прайс точки: название, цена и длительность. Используются в заказ-нарядах."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">Всего: {services.length}</p>
        <ButtonLink href="/owner/services/new">Новая услуга</ButtonLink>
      </Toolbar>

      {services.length === 0 ? (
        <EmptyStub
          title="Услуг нет"
          description="Добавьте услуги мойки и детейлинга в прайс."
        />
      ) : (
        <DataTable headers={["Услуга", "Цена", "Длительность", "Статус", ""]}>
          {services.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-medium text-[var(--ink)]">
                <Link href={`/owner/services/${s.id}`} className="hover:text-[var(--accent)]">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">{formatRub(s.priceRub)}</td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {formatDuration(s.durationMin)}
              </td>
              <td className="px-4 py-3">
                <StatusPill tone={s.isActive ? "ok" : "neutral"}>
                  {s.isActive ? "Активна" : "Скрыта"}
                </StatusPill>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/services/${s.id}`}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Изменить
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
