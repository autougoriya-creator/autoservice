"use client";

import { useState } from "react";
import { updateWorkOrderStatus } from "@/app/actions/work-orders";
import { SubmitButton } from "@/components/ui";
import {
  Field,
  FormCard,
  TextInput,
  TextSelect,
} from "@/components/forms";
import { formatRub, paymentMethodLabel, workOrderStatusLabel } from "@/lib/format";
import type { WorkOrderStatus } from "@prisma/client";

export function WorkOrderStatusForm({
  workOrderId,
  status,
  paymentMethod,
  cashPaidRub,
  terminalPaidRub,
  totalRub,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  paymentMethod: string | null;
  cashPaidRub: number | null;
  terminalPaidRub: number | null;
  totalRub: number;
}) {
  const [method, setMethod] = useState(paymentMethod ?? "");
  const [cashRub, setCashRub] = useState(
    cashPaidRub != null ? String(cashPaidRub) : "",
  );
  const [terminalRub, setTerminalRub] = useState(
    terminalPaidRub != null ? String(terminalPaidRub) : "",
  );

  const canClose = status === "IN_PROGRESS";
  const showSplit = method === "CASH_AND_TERMINAL";
  const cashN = Number.parseInt(cashRub, 10);
  const terminalN = Number.parseInt(terminalRub, 10);
  const splitSum =
    Number.isFinite(cashN) && Number.isFinite(terminalN)
      ? cashN + terminalN
      : null;
  const splitOk = splitSum === totalRub;

  function onCashChange(raw: string) {
    setCashRub(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= totalRub) {
      setTerminalRub(String(totalRub - n));
    }
  }

  function onTerminalChange(raw: string) {
    setTerminalRub(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= totalRub) {
      setCashRub(String(totalRub - n));
    }
  }

  function onMethodChange(next: string) {
    setMethod(next);
    if (next === "CASH_AND_TERMINAL" && !cashRub && !terminalRub && totalRub > 0) {
      const half = Math.floor(totalRub / 2);
      setCashRub(String(half));
      setTerminalRub(String(totalRub - half));
    }
  }

  return (
    <FormCard>
      <form action={updateWorkOrderStatus} className="space-y-4">
        <input type="hidden" name="id" value={workOrderId} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Статус
          </p>
          <p className="mt-1 font-semibold text-[var(--ink)]">
            {workOrderStatusLabel[status]}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            Заказ-наряд: в работе → закрыт (статусы записи живут отдельно)
          </p>
        </div>
        <Field label="Вид оплаты (для закрытия)" htmlFor="paymentMethod">
          <TextSelect
            id="paymentMethod"
            name="paymentMethod"
            value={method}
            onChange={(e) => onMethodChange(e.target.value)}
            disabled={!canClose}
          >
            <option value="">— выберите при закрытии —</option>
            {Object.entries(paymentMethodLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </TextSelect>
        </Field>

        {showSplit && canClose ? (
          <div className="space-y-3 rounded-md border border-[var(--line)] bg-[var(--bg)]/60 p-3">
            <p className="text-sm text-[var(--ink-soft)]">
              Итого ЗН: {formatRub(totalRub)}. Укажите, сколько уходит в кассу
              (нал) и сколько по терминалу — для снятия кассы в конце смены.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="В кассу (нал), ₽" htmlFor="cashPaidRub">
                <TextInput
                  id="cashPaidRub"
                  name="cashPaidRub"
                  inputMode="numeric"
                  required
                  value={cashRub}
                  onChange={(e) => onCashChange(e.target.value)}
                />
              </Field>
              <Field label="По терминалу, ₽" htmlFor="terminalPaidRub">
                <TextInput
                  id="terminalPaidRub"
                  name="terminalPaidRub"
                  inputMode="numeric"
                  required
                  value={terminalRub}
                  onChange={(e) => onTerminalChange(e.target.value)}
                />
              </Field>
            </div>
            {splitSum != null && !splitOk ? (
              <p className="text-xs text-red-700">
                Сейчас {formatRub(splitSum)} — должно быть {formatRub(totalRub)}.
              </p>
            ) : null}
          </div>
        ) : null}

        {canClose ? (
          <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              name="writeOffByNorms"
              value="1"
              defaultChecked
              className="mt-1"
            />
            <span>
              При закрытии списать техжидкости по нормам услуг
              <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                Если у услуг заданы нормы расхода на складе.
              </span>
            </span>
          </label>
        ) : null}
        <p className="text-xs text-[var(--ink-soft)]">
          «Сохранить» пишет вид оплаты без смены статуса. «Закрыть ЗН» ставит
          статус «закрыт» и требует вид оплаты. Администратор проверяет состав
          услуг при проведении.
        </p>
        {canClose ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <SubmitButton
              name="intent"
              value="save"
              variant="ghost"
              className="sm:flex-1"
            >
              Сохранить
            </SubmitButton>
            <SubmitButton
              name="intent"
              value="close"
              className="sm:flex-1"
            >
              Закрыть ЗН
            </SubmitButton>
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-soft)]">
            Дальнейших переходов нет — заказ закрыт.
          </p>
        )}
      </form>
    </FormCard>
  );
}
