import { logout } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { OPS_ROLES } from "@/lib/tenant";
import { PageFrame } from "@/components/ui";
import { AppShellNav } from "@/components/shell-nav";

function navForRole(role: string) {
  if (role === "OWNER") {
    return {
      brandHref: "/owner",
      title: "Кабинет владельца",
      links: [
        { href: "/owner", label: "Обзор" },
        { href: "/owner/desk", label: "Рабочий стол" },
        { href: "/owner/pnl", label: "Экономика" },
        { href: "/owner/staff", label: "Персонал" },
        { href: "/owner/schedule", label: "График" },
        { href: "/owner/posts", label: "Посты" },
        { href: "/owner/work-orders", label: "Заказ-наряды" },
        { href: "/owner/clients", label: "Клиенты" },
        { href: "/owner/services", label: "Услуги" },
        { href: "/owner/bookings", label: "Запись" },
      ],
    };
  }

  if (role === "ADMIN") {
    return {
      brandHref: "/owner",
      title: "Кабинет администратора",
      links: [
        { href: "/owner", label: "Обзор" },
        { href: "/owner/desk", label: "Рабочий стол" },
        { href: "/owner/schedule", label: "График" },
        { href: "/owner/posts", label: "Посты" },
        { href: "/owner/work-orders", label: "Заказ-наряды" },
        { href: "/owner/clients", label: "Клиенты" },
        { href: "/owner/services", label: "Услуги" },
        { href: "/owner/bookings", label: "Запись" },
      ],
    };
  }

  // STAFF — мойщик / слесарь
  return {
    brandHref: "/owner/my-work",
    title: "Кабинет сотрудника",
    links: [
      { href: "/owner/my-work", label: "Моя смена" },
      { href: "/owner/desk", label: "Мой пост" },
      { href: "/owner/work-orders", label: "Заказ-наряды" },
      { href: "/owner/bookings", label: "Запись" },
    ],
  };
}

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(OPS_ROLES);
  const nav = navForRole(session.membership.role);

  return (
    <div className="flex min-h-screen flex-col">
      <AppShellNav
        brandHref={nav.brandHref}
        title={nav.title}
        orgName={session.membership.organization.name}
        role={roleLabel[session.membership.role] ?? session.membership.role}
        links={nav.links}
        logoutAction={logout}
      />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
