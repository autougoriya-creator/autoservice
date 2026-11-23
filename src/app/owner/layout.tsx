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

  return (
    <div className="flex min-h-screen flex-col">
      <AppShellNav
        brandHref="/owner"
        title={
          session.membership.role === "OWNER"
            ? "Кабинет владельца"
            : "Кабинет персонала"
        }
        orgName={session.membership.organization.name}
        role={roleLabel[session.membership.role]}
        links={[
          { href: "/owner", label: "Обзор" },
          { href: "/owner/work-orders", label: "Заказ-наряды" },
          { href: "/owner/clients", label: "Клиенты" },
          { href: "/owner/vehicles", label: "Авто" },
          { href: "/owner/services", label: "Услуги" },
          { href: "/owner/posts", label: "Посты" },
          { href: "/owner/bookings", label: "Запись" },
        ]}
        logoutAction={logout}
      />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
