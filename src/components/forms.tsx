import type { ReactNode } from "react";

export function FormCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-white/85 p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-sm font-semibold text-[var(--ink)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--ink-soft)]">{hint}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-md border border-[var(--line)] bg-white px-3 py-3 text-base text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function TextTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${controlClass} min-h-[96px] resize-y ${props.className ?? ""}`}
    />
  );
}

export function TextSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white/85">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-[var(--line)] bg-[var(--paper)]/80 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}
