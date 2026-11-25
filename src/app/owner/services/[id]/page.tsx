import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteService, updateService } from "@/app/actions/directories";
import {
  deleteServiceFluidNorm,
  saveServiceFluidNorm,
} from "@/app/actions/warehouse";
import { prisma } from "@/lib/prisma";
import { formatQty } from "@/lib/warehouse";
import {
  MANAGEMENT_ROLES,
  orgIdOf,
  requireStaffSession,
} from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";

export default async function ServiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;
  const canManageNorms = MANAGEMENT_ROLES.includes(session.membership.role);

  const [service, fluidSkus, vehicleClasses] = await Promise.all([
    prisma.service.findFirst({
      where: { id, organizationId },
      include: {
        fluidNorms: {
          include: { fluidSku: true },
          orderBy: { fluidSku: { name: "asc" } },
        },
        classPrices: true,
      },
    }),
    canManageNorms
      ? prisma.fluidSku.findMany({
          where: { organizationId, isActive: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.vehicleClass.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!service) notFound();

  const priceByClass = new Map(
    service.classPrices.map((p) => [p.vehicleClassId, p.priceRub]),
  );

  return (
    <div className="max-w-xl space-y-8">
      <SectionTitle
        eyebrow="Справочник"
        title={service.name}
        description="Базовая цена, цены по классам авто, норма времени и расход техжидкостей."
      />

      <FormCard>
        <form action={updateService} className="space-y-4">
          <input type="hidden" name="id" value={service.id} />
          <Field label="Название" htmlFor="name">
            <TextInput id="name" name="name" required defaultValue={service.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Базовая цена, ₽"
              htmlFor="priceRub"
              hint="Если нет цены по классу"
            >
              <TextInput
                id="priceRub"
                name="priceRub"
                required
                inputMode="numeric"
                defaultValue={service.priceRub}
              />
            </Field>
            <Field
              label="Норма времени, мин"
              htmlFor="durationMin"
              hint="Подставляется при создании заказ-наряда"
            >
              <TextInput
                id="durationMin"
                name="durationMin"
                required
                inputMode="numeric"
                defaultValue={service.durationMin}
              />
            </Field>
          </div>

          {vehicleClasses.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--ink)]">
                Цены по классам авто
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {vehicleClasses.map((vc) => (
                  <Field
                    key={vc.id}
                    label={`${vc.code} · ${vc.name}`}
                    htmlFor={`classPrice_${vc.id}`}
                  >
                    <TextInput
                      id={`classPrice_${vc.id}`}
                      name={`classPrice_${vc.id}`}
                      inputMode="numeric"
                      defaultValue={
                        priceByClass.get(vc.id) ?? service.priceRub
                      }
                    />
                  </Field>
                ))}
              </div>
            </fieldset>
          ) : null}

          <Field label="Статус" htmlFor="isActive">
            <TextSelect
              id="isActive"
              name="isActive"
              defaultValue={service.isActive ? "1" : "0"}
            >
              <option value="1">Активна</option>
              <option value="0">Скрыта</option>
            </TextSelect>
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
          </FormActions>
        </form>
      </FormCard>

      {canManageNorms ? (
        <FormCard>
          <h2 className="brand-mark mb-1 text-lg">Нормы расхода техжидкости</h2>
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Сколько списывать со склада на одну единицу услуги.{" "}
            <Link href="/owner/warehouse" className="font-semibold text-[var(--accent)]">
              Склад
            </Link>
          </p>

          {service.fluidNorms.length > 0 ? (
            <ul className="mb-6 divide-y divide-[var(--line)]">
              {service.fluidNorms.map((norm) => (
                <li
                  key={norm.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-medium text-[var(--ink)]">
                      {norm.fluidSku.name}
                    </p>
                    <p className="text-xs text-[var(--ink-soft)]">
                      {formatQty(norm.quantityPerUnit, norm.fluidSku.unit)} на
                      услугу
                    </p>
                  </div>
                  <form action={deleteServiceFluidNorm}>
                    <input type="hidden" name="id" value={norm.id} />
                    <input type="hidden" name="serviceId" value={service.id} />
                    <button
                      type="submit"
                      className="cursor-pointer text-sm font-semibold text-red-700 hover:underline"
                    >
                      Удалить
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-[var(--ink-soft)]">
              Норм расхода пока нет.
            </p>
          )}

          {fluidSkus.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Сначала добавьте техжидкости на{" "}
              <Link href="/owner/warehouse/new" className="font-semibold text-[var(--accent)]">
                склад
              </Link>
              .
            </p>
          ) : (
            <form action={saveServiceFluidNorm} className="space-y-4">
              <input type="hidden" name="serviceId" value={service.id} />
              <Field label="Техжидкость" htmlFor="fluidSkuId">
                <TextSelect id="fluidSkuId" name="fluidSkuId" required>
                  <option value="">— выберите —</option>
                  {fluidSkus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} ({sku.unit})
                    </option>
                  ))}
                </TextSelect>
              </Field>
              <Field
                label="Норма на 1 услугу"
                htmlFor="quantityPerUnit"
                hint="В единицах выбранной позиции"
              >
                <TextInput
                  id="quantityPerUnit"
                  name="quantityPerUnit"
                  required
                  inputMode="decimal"
                  placeholder="0.05"
                />
              </Field>
              <SubmitButton variant="ghost">Сохранить норму</SubmitButton>
            </form>
          )}
        </FormCard>
      ) : null}

      <form action={deleteService}>
        <input type="hidden" name="id" value={service.id} />
        <button
          type="submit"
          className="cursor-pointer text-sm font-semibold text-red-700 hover:underline"
        >
          Удалить услугу
        </button>
      </form>
    </div>
  );
}
