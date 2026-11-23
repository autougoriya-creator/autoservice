import { notFound } from "next/navigation";
import { upsertStaffProfile } from "@/app/actions/staff";
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

export default async function StaffEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStaffSession(["OWNER"]);
  const organizationId = orgIdOf(session);
  const { id } = await params;

  const profile = await prisma.staffProfile.findFirst({
    where: { id, organizationId },
    include: { user: true },
  });
  if (!profile) notFound();

  return (
    <div className="max-w-xl">
      <SectionTitle
        eyebrow="Персонал"
        title={profile.user.name}
        description={`${profile.user.email} · настройки оплаты`}
      />
      <FormCard>
        <form action={upsertStaffProfile} className="space-y-4">
          <input type="hidden" name="id" value={profile.id} />
          <input type="hidden" name="userId" value={profile.userId} />
          <Field label="Должность" htmlFor="title">
            <TextInput id="title" name="title" defaultValue={profile.title} />
          </Field>
          <Field label="Режим оплаты" htmlFor="payMode">
            <TextSelect
              id="payMode"
              name="payMode"
              defaultValue={profile.payMode}
            >
              <option value="DEAL">Сделка — % от заказ-наряда</option>
              <option value="SALARY">Оклад — фиксированная ЗП</option>
            </TextSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="% сделки" htmlFor="dealPercent">
              <TextInput
                id="dealPercent"
                name="dealPercent"
                inputMode="numeric"
                defaultValue={profile.dealPercent}
              />
            </Field>
            <Field label="Оклад, ₽/мес" htmlFor="salaryRub">
              <TextInput
                id="salaryRub"
                name="salaryRub"
                inputMode="numeric"
                defaultValue={profile.salaryRub}
              />
            </Field>
          </div>
          <Field label="Статус" htmlFor="isActive">
            <TextSelect
              id="isActive"
              name="isActive"
              defaultValue={profile.isActive ? "1" : "0"}
            >
              <option value="1">Активен</option>
              <option value="0">Скрыт</option>
            </TextSelect>
          </Field>
          <FormActions>
            <SubmitButton className="sm:w-auto">Сохранить</SubmitButton>
          </FormActions>
        </form>
      </FormCard>
    </div>
  );
}
