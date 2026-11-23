import { logout } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { PageFrame } from "@/components/ui";
import { AppShellNav } from "@/components/shell-nav";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(["OWNER", "STAFF"]);
  const isOwner = session.membership.role === "OWNER";

  const links = isOwner
    ? [
        { href: "/owner", label: "Обзор" },
        { href: "/owner/desk", label: "Рабочий стол" },
        { href: "/owner/pnl", label: "Экономика" },
        { href: "/owner/staff", label: "Персонал" },
        { href: "/owner/schedule", label: "График" },
        { href: "/owner/work-orders", label: "Заказ-наряды" },
        { href: "/owner/clients", label: "Клиенты" },
        { href: "/owner/services", label: "Услуги" },
        { href: "/owner/bookings", label: "Запись" },
      ]
    : [
        { href: "/owner/my-work", label: "Моя смена" },
        { href: "/owner/desk", label: "Рабочий стол" },
        { href: "/owner/work-orders", label: "Заказ-наряды" },
        { href: "/owner/bookings", label: "Запись" },
      ];

  return (
    <div className="flex min-h-screen flex-col">
      <AppShellNav
        brandHref={isOwner ? "/owner" : "/owner/my-work"}
        title={
          isOwner ? "Кабинет владельца" : "Кабинет сотрудника"
        }
        orgName={session.membership.organization.name}
        role={roleLabel[session.membership.role]}
        links={links}
        logoutAction={logout}
      />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
