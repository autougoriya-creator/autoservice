import Link from "next/link";
import { createService } from "@/app/actions/directories";
import { requireStaffSession } from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";

export default async function NewServicePage() {
  await requireStaffSession();

  return (
    <div className="max-w-xl">
      <SectionTitle
        eyebrow="Справочник"
        title="Новая услуга"
        description="Цена в рублях, норма времени в минутах. Нормы расхода техжидкостей — после сохранения."
      />

      <FormCard>
        <form action={createService} className="space-y-4">
          <Field label="Название" htmlFor="name">
            <TextInput
              id="name"
              name="name"
              required
              placeholder="Комплексная мойка"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Цена, ₽" htmlFor="priceRub">
              <TextInput
                id="priceRub"
                name="priceRub"
                required
                inputMode="numeric"
                defaultValue="1000"
              />
            </Field>
            <Field label="Норма времени, мин" htmlFor="durationMin">
              <TextInput
                id="durationMin"
                name="durationMin"
                required
                inputMode="numeric"
                defaultValue="30"
              />
            </Field>
          </div>
          <Field label="Статус" htmlFor="isActive">
            <TextSelect id="isActive" name="isActive" defaultValue="1">
              <option value="1">Активна</option>
              <option value="0">Скрыта</option>
            </TextSelect>
          </Field>
          <FormActions>
            <Link
              href="/owner/services"
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
