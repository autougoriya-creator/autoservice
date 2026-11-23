import { redirect } from "next/navigation";
import { loginAs } from "@/app/actions/auth";
import { DEMO_ACCOUNTS, getSession, homeForRole } from "@/lib/auth";
import { BrandMark, SubmitButton } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(homeForRole(session.membership.role));
  }

  const users = await prisma.user.findMany({
    where: {
      email: { in: DEMO_ACCOUNTS.map((a) => a.email) },
    },
    include: {
      memberships: {
        include: { organization: true },
        take: 1,
      },
    },
  });

  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));

  return (
    <div className="grain relative flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <BrandMark className="text-xl text-[var(--ink)]" />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Демо-вход
        </p>
        <h1 className="brand-mark mt-3 text-4xl text-[var(--ink)]">Войти</h1>
        <p className="mt-3 text-[var(--ink-soft)]">
          Настоящая авторизация пока заглушка: выберите роль — cookie
          сохранится на 14 дней. Пароль не нужен.
        </p>

        {users.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-[var(--line)] bg-white/70 p-6 text-sm text-[var(--ink-soft)]">
            Демо-пользователи не найдены. В корне проекта выполните{" "}
            <code className="rounded bg-[var(--paper-deep)] px-1.5 py-0.5 text-[var(--ink)]">
              npm run db:seed
            </code>
            .
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {DEMO_ACCOUNTS.map((account) => {
              const user = byEmail[account.email];
              if (!user) return null;
              const org = user.memberships[0]?.organization;

              return (
                <li
                  key={account.email}
                  className="rounded-xl border border-[var(--line)] bg-white/80 p-4 shadow-[0_8px_24px_rgba(20,33,43,0.05)]"
                >
                  <form
                    action={async () => {
                      "use server";
                      await loginAs(account.email);
                    }}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">
                          {account.label}
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          {user.name}
                          {org ? ` · ${org.name}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          {account.email}
                        </p>
                      </div>
                      <span className="rounded-md bg-[var(--teal-soft)] px-2 py-1 text-xs font-semibold text-[var(--teal)]">
                        {account.description}
                      </span>
                    </div>
                    <SubmitButton>Войти как {account.label.toLowerCase()}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
