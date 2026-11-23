import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, EmptyStub, SectionTitle } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function VehiclesPage() {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    include: { customer: true },
    orderBy: [{ make: "asc" }, { model: "asc" }],
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Справочник"
        title="Автомобили"
        description="Авто привязаны к клиентам. Госномер — главный идентификатор на мойке."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">Всего: {vehicles.length}</p>
        <ButtonLink href="/owner/vehicles/new">Новое авто</ButtonLink>
      </Toolbar>

      {vehicles.length === 0 ? (
        <EmptyStub
          title="Автомобилей нет"
          description="Сначала добавьте клиента, затем его машину."
        />
      ) : (
        <DataTable headers={["Госномер", "Марка / модель", "Клиент", ""]}>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-semibold tracking-wide text-[var(--ink)]">
                <Link href={`/owner/vehicles/${v.id}`} className="hover:text-[var(--accent)]">
                  {v.plate}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {v.make} {v.model}
                {v.year ? ` · ${v.year}` : ""}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/owner/clients/${v.customerId}`}
                  className="text-[var(--ink)] hover:text-[var(--accent)]"
                >
                  {v.customer.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/vehicles/${v.id}`}
                  className="text-sm font-semibold text-[var(--accent)]"
                >
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
