import { notFound } from "next/navigation";
import { deleteService, updateService } from "@/app/actions/directories";
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

export default async function ServiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession();
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const service = await prisma.service.findFirst({
    where: { id, organizationId },
  });
  if (!service) notFound();

  return (
    <div className="max-w-xl space-y-8">
      <SectionTitle eyebrow="Справочник" title={service.name} />

      <FormCard>
        <form action={updateService} className="space-y-4">
          <input type="hidden" name="id" value={service.id} />
          <Field label="Название" htmlFor="name">
            <TextInput id="name" name="name" required defaultValue={service.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Цена, ₽" htmlFor="priceRub">
              <TextInput
                id="priceRub"
                name="priceRub"
                required
                inputMode="numeric"
                defaultValue={service.priceRub}
              />
            </Field>
            <Field label="Длительность, мин" htmlFor="durationMin">
              <TextInput
                id="durationMin"
                name="durationMin"
                required
                inputMode="numeric"
                defaultValue={service.durationMin}
              />
            </Field>
          </div>
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
