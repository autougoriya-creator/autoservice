import Link from "next/link";
import { createCustomer } from "@/app/actions/directories";
import { requireStaffSession } from "@/lib/tenant";
import { SectionTitle, SubmitButton } from "@/components/ui";
import {
  Field,
  FormActions,
  FormCard,
  TextInput,
  TextTextarea,
} from "@/components/forms";

export default async function NewClientPage() {
  await requireStaffSession();

  return (
    <div className="max-w-xl">
      <SectionTitle
        eyebrow="Справочник"
        title="Новый клиент"
        description="Телефон обязателен и уникален в точке — это идентификатор клиента для аналитики."
      />

      <FormCard>
        <form action={createCustomer} className="space-y-4">
          <Field label="Имя" htmlFor="name">
            <TextInput id="name" name="name" required placeholder="Иван Иванов" />
          </Field>
          <Field label="Телефон (ID клиента)" htmlFor="phone">
            <TextInput
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="+7 900 000-00-00"
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              name="email"
              type="email"
              placeholder="client@example.com"
            />
          </Field>
          <Field label="Заметки" htmlFor="notes">
            <TextTextarea id="notes" name="notes" placeholder="Предпочтения, комментарии" />
          </Field>
          <FormActions>
            <Link
              href="/owner/clients"
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
