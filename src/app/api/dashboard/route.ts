import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const projects =
    user.globalRole === "ADMIN"
      ? await prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true } })
      : await prisma.project.findMany({
          where: { archived: false, members: { some: { userId: user.id } } },
          select: { id: true, name: true },
        });

  const pids = projectId ? [projectId] : projects.map((p) => p.id);

  const stats = await Promise.all(
    pids.map(async (pid) => {
      const role = await getProjectRole(user.id, pid);
      if (user.globalRole !== "ADMIN" && !role) return null;
      const where = taskVisibilityWhere(pid, user.id, user.globalRole, role);

      const [total, done, blocked, byUser] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.count({ where: { ...where, status: "done" } }),
        prisma.task.count({ where: { ...where, status: "blocked" } }),
        prisma.task.groupBy({
          by: ["assigneeId"],
          where: { ...where, assigneeId: { not: null } },
          _count: { _all: true },
        }),
      ]);

      const overdue = await prisma.task.count({
        where: {
          ...where,
          status: { not: "done" },
          deadline: { lt: new Date() },
        },
      });

      const completionRate = total ? Math.round((done / total) * 1000) / 10 : 0;
      const healthScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            completionRate * 0.55 +
              (total ? ((total - blocked - overdue) / total) * 45 : 45),
          ),
        ),
      );

      return {
        projectId: pid,
        total,
        done,
        blocked,
        overdue,
        completionRate,
        healthScore,
        load: byUser.map((b) => ({
          assigneeId: b.assigneeId,
          count: b._count._all,
        })),
      };
    }),
  );

  return NextResponse.json({
    projects,
    stats: stats.filter(Boolean),
  });
}
