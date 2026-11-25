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
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <BrandMark href={brandHref} className="text-lg text-[var(--ink)]" />
            <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
              {orgName} · {role}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-medium text-[var(--ink-soft)] md:inline">
              {title}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:border-[var(--ink)]/30"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== brandHref && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "!bg-[var(--ink)] !text-white"
                    : "text-[var(--ink-soft)] hover:bg-white hover:text-[var(--ink)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
