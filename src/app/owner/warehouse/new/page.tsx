import Link from "next/link";
import { createFluidSku } from "@/app/actions/warehouse";
import { requireManagementSession } from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";

export default async function NewFluidSkuPage() {
  await requireManagementSession();

  return (
    <div className="max-w-xl">
      <SectionTitle
        eyebrow="Склад"
        title="Новая техжидкость"
        description="Название, единица учёта и начальный остаток."
      />

      <FormCard>
        <form action={createFluidSku} className="space-y-4">
          <Field label="Название" htmlFor="name">
            <TextInput
              id="name"
              name="name"
              required
              placeholder="Шампунь активный"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Единица" htmlFor="unit">
              <TextSelect id="unit" name="unit" defaultValue="л">
                <option value="л">л</option>
                <option value="мл">мл</option>
                <option value="шт">шт</option>
                <option value="кг">кг</option>
              </TextSelect>
            </Field>
            <Field label="Код / артикул" htmlFor="skuCode">
              <TextInput id="skuCode" name="skuCode" placeholder="SH-01" />
            </Field>
          </div>
          <Field
            label="Начальный остаток"
            htmlFor="quantityOnHand"
            hint="Можно оставить 0 и оприходовать позже"
          >
            <TextInput
              id="quantityOnHand"
              name="quantityOnHand"
              inputMode="decimal"
              defaultValue="0"
            />
          </Field>
          <Field label="Статус" htmlFor="isActive">
            <TextSelect id="isActive" name="isActive" defaultValue="1">
              <option value="1">В учёте</option>
              <option value="0">Скрыта</option>
            </TextSelect>
          </Field>
          <FormActions>
            <Link
              href="/owner/warehouse"
              className="inline-flex items-center justify-center rounded-md border border-[var(--line)] px-5 py-3 text-sm font-semibold"
            >
              Отмена
            </Link>
            <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
          </FormActions>
        </form>
      </FormCard>
    </div>
  );
}
