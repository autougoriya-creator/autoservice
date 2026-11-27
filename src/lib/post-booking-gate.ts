import { prisma } from "@/lib/prisma";

/** Смена на посту, покрывающая слот записи. */
export type PostShiftCover = {
  postId: string;
  startsAt: Date;
  endsAt: Date;
};

/** Слот полностью внутри смены на этом посту. */
export function slotCoveredByShift(
  startsAt: Date,
  durationMin: number,
  shifts: PostShiftCover[],
  postId: string,
) {
  const start = startsAt.getTime();
  const end = start + Math.max(0, durationMin) * 60_000;
  return shifts.some(
    (s) =>
      s.postId === postId &&
      s.startsAt.getTime() <= start &&
      s.endsAt.getTime() >= end,
  );
}

/**
 * Найти смену на посту, которая покрывает весь интервал записи.
 * Есть смена ⇒ пост «в работе» и назначен исполнитель.
 */
export async function findCoveringPostShift(
  organizationId: string,
  postId: string,
  startsAt: Date,
  durationMin: number,
) {
  const endsAt = new Date(
    startsAt.getTime() + Math.max(0, durationMin) * 60_000,
  );
  return prisma.staffShift.findFirst({
    where: {
      organizationId,
      postId,
      startsAt: { lte: startsAt },
      endsAt: { gte: endsAt },
    },
    select: { id: true, staffProfileId: true, startsAt: true, endsAt: true },
  });
}

export function postStaffingError(postName: string): string {
  return `Запись на «${postName}» недоступна: пост не в работе по графику или нет исполнителя на это время`;
}

/** Серверный гейт: null если можно записывать. */
export async function assertPostSlotBookable(
  organizationId: string,
  post: { id: string; name: string },
  startsAt: Date,
  durationMin: number,
): Promise<string | null> {
  const cover = await findCoveringPostShift(
    organizationId,
    post.id,
    startsAt,
    durationMin,
  );
  return cover ? null : postStaffingError(post.name);
}
