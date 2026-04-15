import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-context";
import { addDays, startOfDay } from "date-fns";

/** My Tasks — 创建 / 负责 / 协作 / @提及 / 即将到期 / 延期 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberProjects = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const projectIds = memberProjects.map((m) => m.projectId);

  const baseOr = [
    { createdById: user.id },
    { assigneeId: user.id },
    { collaborators: { some: { userId: user.id } } },
    { comments: { some: { mentions: { some: { userId: user.id } } } } },
  ];

  const now = new Date();
  const in3 = addDays(startOfDay(now), 3);

  const [created, assigned, participating, mentioned, dueSoon, overdue] = await Promise.all([
    prisma.task.findMany({
      where: { createdById: user.id, projectId: { in: projectIds } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, projectId: { in: projectIds } },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        collaborators: { some: { userId: user.id } },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        comments: { some: { mentions: { some: { userId: user.id } } } },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        AND: [
          { OR: baseOr },
          { deadline: { lte: in3, gte: startOfDay(now) } },
          { status: { not: "done" } },
        ],
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { deadline: "asc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        AND: [
          { OR: baseOr },
          { deadline: { lt: startOfDay(now) } },
          { status: { not: "done" } },
        ],
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { deadline: "asc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    created,
    assigned,
    participating,
    mentioned,
    dueSoon,
    overdue,
  });
}
