import { prisma } from "@/lib/prisma";
import { orgIdOf, requireManagementSession } from "@/lib/tenant";
import { formatPostHours } from "@/lib/payroll";
import { toDateInputValue } from "@/lib/schedule-fill";
import {
  dayKeyOf,
  formatMonthParam,
  monthBounds,
  parseMonthParam,
  type ScheduleShiftTile,
} from "@/lib/schedule-board";
import { ScheduleMonthBoard } from "@/components/schedule-month-board";
import { ScheduleFillForm } from "@/components/schedule-fill-form";
import { SectionTitle } from "@/components/ui";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
  }>;
}) {
  const session = await requireManagementSession();
  const organizationId = orgIdOf(session);
  const params = await searchParams;
  const canEditStaff = session.membership.role === "OWNER";

  const monthStart = parseMonthParam(params.month);
  const monthParam = formatMonthParam(monthStart);
  const { start: monthFrom, end: monthTo } = monthBounds(monthStart);

  const now = new Date();
  const periodFrom = new Date(now);
  periodFrom.setHours(0, 0, 0, 0);
  const periodTo = new Date(periodFrom);
  periodTo.setDate(periodFrom.getDate() + 13);

  const [profiles, posts, monthShifts, adminMemberships] = await Promise.all([
    prisma.staffProfile.findMany({
      where: { organizationId, isActive: true },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.staffShift.findMany({
      where: {
        organizationId,
        postId: { not: null },
        startsAt: { lt: monthTo },
        endsAt: { gt: monthFrom },
      },
      include: {
        staffProfile: { include: { user: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId, role: "ADMIN" },
      select: { userId: true },
    }),
  ]);

  const adminUserIds = new Set(adminMemberships.map((m) => m.userId));
  const floorProfiles = profiles.filter((p) => !adminUserIds.has(p.userId));

  const boardPosts = posts.map((p) => ({
    id: p.id,
    name: p.name,
    workStartHour: p.workStartHour,
    workEndHour: p.workEndHour,
  }));

  const boardStaff = floorProfiles.map((p) => ({
    id: p.id,
    name: p.user.name,
    title: p.title,
  }));

  const boardTiles: ScheduleShiftTile[] = monthShifts
    .filter((s): s is typeof s & { postId: string } => Boolean(s.postId))
    .map((s) => ({
      id: s.id,
      staffProfileId: s.staffProfileId,
      staffName: s.staffProfile.user.name,
      staffTitle: s.staffProfile.title,
      postId: s.postId,
      dayKey: dayKeyOf(s.startsAt),
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      note: s.note,
    }));

  return (
    <div className="space-y-10">
      <SectionTitle
        eyebrow="График"
        title="Смены персонала"
        description="Месячная доска постов и заполнение графика работы. Мойщики/слесари — с постом; администратор — смена без поста."
      />

      <ScheduleMonthBoard
        monthParam={monthParam}
        posts={boardPosts}
        staff={boardStaff}
        initialTiles={boardTiles}
        canEditStaff={canEditStaff}
      />

      <ScheduleFillForm
        posts={posts.map((p) => ({
          id: p.id,
          name: p.name,
          hoursLabel: formatPostHours(p.workStartHour, p.workEndHour),
        }))}
        staff={boardStaff}
        defaultFromDate={toDateInputValue(periodFrom)}
        defaultToDate={toDateInputValue(periodTo)}
      />
    </div>
  );
}
