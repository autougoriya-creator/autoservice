import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { ButtonLink, EmptyStub, SectionTitle } from "@/components/ui";
import { DataTable, Toolbar } from "@/components/forms";

export default async function ClientsPage() {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);

  const clients = await prisma.customer.findMany({
    where: { organizationId },
    include: { _count: { select: { vehicles: true, workOrders: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <SectionTitle
        eyebrow="Справочник"
        title="Клиенты"
        description="База клиентов точки. С планшета удобно искать по имени или телефону и открывать карточку."
      />

      <Toolbar>
        <p className="text-sm text-[var(--ink-soft)]">
          Всего: {clients.length}
        </p>
        <ButtonLink href="/owner/clients/new">Новый клиент</ButtonLink>
      </Toolbar>

      {clients.length === 0 ? (
        <EmptyStub
          title="Клиентов пока нет"
          description="Добавьте первого клиента, затем привяжите автомобиль."
        />
      ) : (
        <DataTable headers={["Имя", "Телефон", "Авто", "Заказ-наряды", ""]}>
          {clients.map((client) => (
            <tr key={client.id}>
              <td className="px-4 py-3 font-medium text-[var(--ink)]">
                <Link
                  href={`/owner/clients/${client.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {client.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {client.phone ?? "—"}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {client._count.vehicles}
              </td>
              <td className="px-4 py-3 text-[var(--ink-soft)]">
                {client._count.workOrders}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/owner/clients/${client.id}`}
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
