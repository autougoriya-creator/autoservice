import { prisma } from "@/lib/prisma";
import {
  dealCostForPostShare,
  dealCostForRevenue,
  periodBounds,
  salaryCostForPeriod,
  sumWorkOrderRevenue,
  uniqueShiftDays,
  type PeriodKey,
} from "@/lib/payroll";
import { workOrderTotal } from "@/lib/work-order";

const ACTIVE_WO = new Set(["IN_PROGRESS", "CLOSED"]);

export async function buildPostPnL(
  organizationId: string,
  period: PeriodKey,
  anchor = new Date(),
) {
  const { start, end } = periodBounds(period, anchor);

  const [posts, assignments, shifts, workOrders, profiles] = await Promise.all([
    prisma.servicePost.findMany({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.postAssignment.findMany({
      where: { organizationId },
      include: { staffProfile: { include: { user: true } } },
    }),
    prisma.staffShift.findMany({
      where: { organizationId },
    }),
    prisma.workOrder.findMany({
      where: { organizationId },
      include: { lines: true },
    }),
    prisma.staffProfile.findMany({
      where: { organizationId, isActive: true },
      include: { user: true },
    }),
  ]);

  const activeAssignments = assignments.filter(
    (a) =>
      a.activeTo == null ||
      (a.activeTo >= start && a.activeFrom <= end),
  );

  const periodShifts = shifts.filter(
    (s) => s.endsAt >= start && s.startsAt <= end,
  );

  const periodWorkOrders = workOrders.filter((wo) => {
    if (!wo.postId || !ACTIVE_WO.has(String(wo.status))) return false;
    const t = wo.completedAt ?? wo.scheduledAt ?? wo.createdAt;
    return t >= start && t <= end;
  });

  const rows = posts.map((post) => {
    const postWOs = periodWorkOrders.filter((wo) => wo.postId === post.id);
    const revenue = sumWorkOrderRevenue(postWOs);
    const postAssignments = activeAssignments.filter((a) => a.postId === post.id);

    let payroll = 0;
    const staffBreakdown: {
      name: string;
      title: string;
      payMode: string;
      sharePercent: number;
      cost: number;
    }[] = [];

    for (const assignment of postAssignments) {
      const profile = assignment.staffProfile;
      const staffShifts = periodShifts.filter(
        (s) =>
          s.staffProfileId === profile.id &&
          (s.postId == null || s.postId === post.id),
      );
      let cost = 0;
      if (String(profile.payMode) === "SALARY") {
        const days = uniqueShiftDays(staffShifts, start, end);
        cost = salaryCostForPeriod(profile.salaryRub, days || (staffShifts.length ? 1 : 0));
      } else {
        cost = dealCostForPostShare(
          revenue,
          assignment.sharePercent,
          profile.dealPercent,
        );
      }
      payroll += cost;
      staffBreakdown.push({
        name: profile.user.name,
        title: profile.title,
        payMode: String(profile.payMode),
        sharePercent: assignment.sharePercent,
        cost,
      });
    }

    return {
      postId: post.id,
      postName: post.name,
      revenue,
      payroll,
      margin: revenue - payroll,
      workOrderCount: postWOs.length,
      staff: staffBreakdown,
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.revenue += row.revenue;
      acc.payroll += row.payroll;
      acc.margin += row.margin;
      return acc;
    },
    { revenue: 0, payroll: 0, margin: 0 },
  );

  return { start, end, period, rows, totals, profiles };
}

export async function buildStaffPayrollEstimate(
  organizationId: string,
  userId: string,
  period: PeriodKey,
  anchor = new Date(),
) {
  const { start, end } = periodBounds(period, anchor);
  const profile = await prisma.staffProfile.findFirst({
    where: { organizationId, userId, isActive: true },
    include: {
      user: true,
      assignments: {
        include: { post: true },
      },
      shifts: { include: { post: true } },
    },
  });

  if (!profile) return null;

  const openAssignments = profile.assignments.filter((a) => a.activeTo == null);
  const postIds = openAssignments.map((a) => a.postId);
  const shareByPost = new Map(
    openAssignments.map((a) => [a.postId, a.sharePercent] as const),
  );

  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId },
    include: { lines: true, post: true },
  });

  const periodWOs = workOrders.filter((wo) => {
    if (!wo.postId || !postIds.includes(wo.postId)) return false;
    if (!ACTIVE_WO.has(String(wo.status))) return false;
    const t = wo.completedAt ?? wo.scheduledAt ?? wo.createdAt;
    return t >= start && t <= end;
  });

  const revenue = sumWorkOrderRevenue(periodWOs);
  let attributed = 0;
  for (const postId of postIds) {
    const postRevenue = sumWorkOrderRevenue(
      periodWOs.filter((wo) => wo.postId === postId),
    );
    attributed += Math.round(
      (postRevenue * (shareByPost.get(postId) ?? 100)) / 100,
    );
  }
  const periodShifts = profile.shifts.filter(
    (s) => s.endsAt >= start && s.startsAt <= end,
  );

  const estimate =
    String(profile.payMode) === "SALARY"
      ? salaryCostForPeriod(
          profile.salaryRub,
          uniqueShiftDays(periodShifts, start, end) ||
            (periodShifts.length ? 1 : 0),
        )
      : dealCostForRevenue(attributed, profile.dealPercent);

  return {
    profile,
    start,
    end,
    period,
    openAssignments,
    periodShifts: periodShifts.sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    ),
    periodWOs: periodWOs.map((wo) => ({
      id: wo.id,
      number: wo.number,
      postName: wo.post?.name ?? "—",
      total: workOrderTotal(wo.lines),
      status: String(wo.status),
      when: wo.completedAt ?? wo.scheduledAt ?? wo.createdAt,
    })),
    revenue,
    estimate,
  };
}
