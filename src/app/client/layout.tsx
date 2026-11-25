import { logout } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import { PageFrame } from "@/components/ui";
import { AppShellNav } from "@/components/shell-nav";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(["CLIENT"]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppShellNav
        brandHref="/client"
        title="Личный кабинет"
        orgName={session.membership.organization.name}
        role={roleLabel[session.membership.role]}
        links={[
          { href: "/client", label: "Обзор" },
          { href: "/client/book", label: "Запись" },
          { href: "/client/orders", label: "История" },
          { href: "/client/cameras", label: "Камеры" },
        ]}
        logoutAction={logout}
      />
      <PageFrame>{children}</PageFrame>
    </div>
  );
}
