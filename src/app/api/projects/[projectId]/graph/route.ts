import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";

/** 任务图谱：节点 + 边（含 parent 树边 + TaskRelation），仅返回当前用户可见任务 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const role = await getProjectRole(user.id, projectId);
  if (user.globalRole !== "ADMIN" && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = taskVisibilityWhere(projectId, user.id, user.globalRole, role);

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      parentId: true,
      deadline: true,
    },
  });

  const visible = new Set(tasks.map((t) => t.id));

  const relations = await prisma.taskRelation.findMany({
    where: {
      projectId,
      AND: [{ fromTaskId: { in: [...visible] } }, { toTaskId: { in: [...visible] } }],
    },
    select: {
      id: true,
      kind: true,
      fromTaskId: true,
      toTaskId: true,
    },
  });

  const edges: {
    id: string;
    source: string;
    target: string;
    kind: string;
    tree?: boolean;
  }[] = [];

  for (const t of tasks) {
    if (t.parentId && visible.has(t.parentId)) {
      edges.push({
        id: `tree-${t.id}`,
        source: t.parentId,
        target: t.id,
        kind: "PARENT",
        tree: true,
      });
    }
  }
  for (const r of relations) {
    edges.push({
      id: r.id,
      source: r.fromTaskId,
      target: r.toTaskId,
      kind: r.kind,
    });
  }

  return NextResponse.json({
    nodes: tasks.map((t) => ({
      id: t.id,
      label: t.title,
      status: t.status,
      parentId: t.parentId,
      deadline: t.deadline,
    })),
    edges,
  });
}
