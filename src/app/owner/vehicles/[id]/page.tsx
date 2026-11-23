import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteVehicle, updateVehicle } from "@/app/actions/directories";
import { prisma } from "@/lib/prisma";
import { orgIdOf, requireStaffSession } from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";

export default async function VehicleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const [vehicle, customers] = await Promise.all([
    prisma.vehicle.findFirst({ where: { id, organizationId } }),
    prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!vehicle) notFound();

  return (
    <div className="max-w-xl space-y-8">
      <SectionTitle
        eyebrow="Справочник"
        title={`${vehicle.make} ${vehicle.model}`}
        description={`Госномер ${vehicle.plate}`}
      />

      <FormCard>
        <form action={updateVehicle} className="space-y-4">
          <input type="hidden" name="id" value={vehicle.id} />
          <Field label="Клиент" htmlFor="customerId">
            <TextSelect
              id="customerId"
              name="customerId"
              required
              defaultValue={vehicle.customerId}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </TextSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Марка" htmlFor="make">
              <TextInput id="make" name="make" required defaultValue={vehicle.make} />
            </Field>
            <Field label="Модель" htmlFor="model">
              <TextInput id="model" name="model" required defaultValue={vehicle.model} />
            </Field>
          </div>
          <Field label="Госномер" htmlFor="plate">
            <TextInput
              id="plate"
              name="plate"
              required
              defaultValue={vehicle.plate}
              className="uppercase"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Год" htmlFor="year">
              <TextInput
                id="year"
                name="year"
                inputMode="numeric"
                defaultValue={vehicle.year ?? ""}
              />
            </Field>
            <Field label="Цвет" htmlFor="color">
              <TextInput id="color" name="color" defaultValue={vehicle.color ?? ""} />
            </Field>
          </div>
          <Field label="VIN" htmlFor="vin">
            <TextInput id="vin" name="vin" defaultValue={vehicle.vin ?? ""} />
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
          </FormActions>
        </form>
      </FormCard>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/owner/work-orders/new?customerId=${vehicle.customerId}&vehicleId=${vehicle.id}`}
          className="text-sm font-semibold text-[var(--accent)]"
        >
          Создать заказ-наряд на это авто
        </Link>
        <form action={deleteVehicle}>
          <input type="hidden" name="id" value={vehicle.id} />
          <button
            type="submit"
            className="cursor-pointer text-sm font-semibold text-red-700 hover:underline"
          >
            Удалить
          </button>
        </form>
      </div>
    </div>
  );
}
