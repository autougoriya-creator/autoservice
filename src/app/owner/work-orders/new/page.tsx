import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { SectionTitle } from "@/components/ui";
import { WorkOrderCreateForm } from "@/components/work-order-create-form";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { customerId, vehicleId } = await searchParams;

  const [customers, vehicles, services] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.vehicle.findMany({
      where: { organizationId },
      orderBy: { plate: "asc" },
    }),
    prisma.service.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <SectionTitle
        eyebrow="Операции"
        title="Новый заказ-наряд"
        description="Выберите клиента, автомобиль и услуги. Цены фиксируются в документе."
      />

      {customers.length === 0 || services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 p-6 text-sm text-[var(--ink-soft)]">
          Нужны{" "}
          <Link href="/owner/clients/new" className="font-semibold text-[var(--accent)]">
            клиенты
          </Link>
          ,{" "}
          <Link href="/owner/vehicles/new" className="font-semibold text-[var(--accent)]">
            автомобили
          </Link>{" "}
          и{" "}
          <Link href="/owner/services/new" className="font-semibold text-[var(--accent)]">
            услуги
          </Link>{" "}
          в справочниках.
        </div>
      ) : (
        <WorkOrderCreateForm
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
          }))}
          vehicles={vehicles.map((v) => ({
            id: v.id,
            customerId: v.customerId,
            make: v.make,
            model: v.model,
            plate: v.plate,
          }))}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            priceRub: s.priceRub,
            durationMin: s.durationMin,
          }))}
          initialCustomerId={customerId}
          initialVehicleId={vehicleId}
        />
      )}
    </div>
  );
}
