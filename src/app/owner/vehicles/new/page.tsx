import Link from "next/link";
import { createVehicle } from "@/app/actions/directories";
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

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { customerId } = await searchParams;

  const [customers, vehicleClasses] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleClass.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <div className="max-w-xl">
      <SectionTitle
        eyebrow="Справочник"
        title="Новое авто"
        description="Клиент, класс автомобиля, марка, модель и госномер."
      />

      <FormCard>
        {customers.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">
            Сначала{" "}
            <Link href="/owner/clients/new" className="font-semibold text-[var(--accent)]">
              создайте клиента
            </Link>
            .
          </p>
        ) : (
          <form action={createVehicle} className="space-y-4">
            <Field label="Клиент" htmlFor="customerId">
              <TextSelect
                id="customerId"
                name="customerId"
                required
                defaultValue={customerId ?? customers[0]?.id}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <Field
              label="Класс автомобиля"
              htmlFor="vehicleClassId"
              hint="От класса зависит цена услуг"
            >
              <TextSelect
                id="vehicleClassId"
                name="vehicleClassId"
                defaultValue={vehicleClasses[0]?.id ?? ""}
              >
                <option value="">— без класса —</option>
                {vehicleClasses.map((vc) => (
                  <option key={vc.id} value={vc.id}>
                    {vc.code} · {vc.name}
                  </option>
                ))}
              </TextSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Марка" htmlFor="make">
                <TextInput id="make" name="make" required placeholder="Toyota" />
              </Field>
              <Field label="Модель" htmlFor="model">
                <TextInput id="model" name="model" required placeholder="Camry" />
              </Field>
            </div>
            <Field label="Госномер" htmlFor="plate">
              <TextInput
                id="plate"
                name="plate"
                required
                placeholder="А123ВС777"
                className="uppercase"
              />
            </Field>
            <Field label="Цвет" htmlFor="color">
              <TextInput id="color" name="color" placeholder="Чёрный" />
            </Field>
            <FormActions>
              <Link
                href="/owner/vehicles"
                className="inline-flex items-center justify-center rounded-md border border-[var(--line)] px-5 py-3 text-sm font-semibold"
              >
                Отмена
              </Link>
              <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
            </FormActions>
          </form>
        )}
      </FormCard>
    </div>
  );
}
