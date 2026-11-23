import Link from "next/link";
import type { ReactNode } from "react";

export function BrandMark({
  className = "",
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link href={href} className={`brand-mark font-semibold tracking-tight ${className}`}>
      Autoservice
    </Link>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost" | "dark";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition duration-200";
  const styles = {
    primary:
      "bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(196,92,38,0.28)] hover:bg-[var(--accent-deep)]",
    ghost:
      "border border-[var(--line)] bg-white/70 text-[var(--ink)] hover:border-[var(--ink)]/30 hover:bg-white",
    dark: "bg-[var(--ink)] text-white hover:bg-[#1d2d3a]",
  }[variant];

  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "dark";
  className?: string;
}) {
  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition duration-200 cursor-pointer";
  const styles = {
    primary:
      "bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(196,92,38,0.28)] hover:bg-[var(--accent-deep)]",
    ghost:
      "border border-[var(--line)] bg-white/70 text-[var(--ink)] hover:border-[var(--ink)]/30 hover:bg-white",
    dark: "bg-[var(--ink)] text-white hover:bg-[#1d2d3a]",
  }[variant];

  return (
    <button type="submit" className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function PageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 ${className}`}>
      {children}
    </main>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8 max-w-2xl">
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="brand-mark text-3xl text-[var(--ink)] sm:text-4xl">{title}</h1>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-[var(--ink-soft)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "accent";
}) {
  const tones = {
    neutral: "bg-white text-[var(--ink-soft)] border-[var(--line)]",
    ok: "bg-[var(--teal-soft)] text-[var(--teal)] border-transparent",
    warn: "bg-[#f4e8c8] text-[#7a5a12] border-transparent",
    accent: "bg-[#f7e4d8] text-[var(--accent-deep)] border-transparent",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${tones}`}
    >
      {children}
    </span>
  );
}

export function EmptyStub({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 px-6 py-10 text-center">
      <p className="brand-mark text-lg text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-soft)]">
        {description}
      </p>
    </div>
  );
}
