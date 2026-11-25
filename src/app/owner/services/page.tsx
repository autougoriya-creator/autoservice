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

  const [services, vehicleClasses] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId },
      include: { classPrices: true },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleClass.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div>
      <SectionTitle
        eyebrow="Справочник"
        title="Услуги"
        description="Прайс по классам авто, норма времени и нормы расхода техжидкостей."
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
        <DataTable
          headers={[
            "Услуга",
            ...vehicleClasses.map((vc) => `Кл. ${vc.code}`),
            ...(vehicleClasses.length === 0 ? ["Цена"] : []),
            "Норма времени",
            "Статус",
            "",
          ]}
        >
          {services.map((s) => {
            const byClass = new Map(
              s.classPrices.map((p) => [p.vehicleClassId, p.priceRub]),
            );
            return (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-[var(--ink)]">
                  <Link
                    href={`/owner/services/${s.id}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {s.name}
                  </Link>
                </td>
                {vehicleClasses.length === 0 ? (
                  <td className="px-4 py-3 text-[var(--ink-soft)]">
                    {formatRub(s.priceRub)}
                  </td>
                ) : (
                  vehicleClasses.map((vc) => (
                    <td
                      key={vc.id}
                      className="px-4 py-3 text-[var(--ink-soft)]"
                    >
                      {formatRub(byClass.get(vc.id) ?? s.priceRub)}
                    </td>
                  ))
                )}
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
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
