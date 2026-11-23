"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/ui";

export function AppShellNav({
  brandHref,
  title,
  orgName,
  role,
  links,
  logoutAction,
}: {
  brandHref: string;
  title: string;
  orgName: string;
  role: string;
  links: { href: string; label: string }[];
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--line)] bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <div>
            <BrandMark href={brandHref} className="text-lg text-[var(--ink)]" />
            <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
              {orgName} · {role}
            </p>
          </div>
          <form action={logoutAction} className="lg:hidden">
            <button
              type="submit"
              className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)]"
            >
              Выйти
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 hidden text-sm font-medium text-[var(--ink-soft)] lg:inline">
            {title}
          </span>
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== brandHref && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <form action={logoutAction} className="hidden lg:block">
            <button
              type="submit"
              className="ml-2 cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:border-[var(--ink)]/30"
            >
              Выйти
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
