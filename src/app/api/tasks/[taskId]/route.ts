import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";
import { canSeeProjectTask } from "@/lib/permissions";
import { logTaskHistory } from "@/lib/history";
import { z } from "zod";
import { TaskPriority, TaskStatus } from "@prisma/client";

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeId: z.string().nullable().optional(),
  startTime: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().nonnegative().nullable().optional(),
  actualHours: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { id: true, name: true, email: true, image: true } },
      createdBy: { select: { id: true, name: true } },
      collaborators: { include: { user: { select: { id: true, name: true, email: true } } } },
      relationsFrom: {
        include: { toTask: { select: { id: true, title: true, status: true } } },
      },
      relationsTo: {
        include: { fromTask: { select: { id: true, title: true, status: true } } },
      },
      children: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          deadline: true,
          assignee: { select: { id: true, name: true } },
        },
      },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true } },
          mentions: { include: { user: { select: { id: true, name: true } } } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              user: { select: { id: true, name: true } },
              mentions: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      },
      history: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true } } },
      },
      project: { select: { id: true, name: true } },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectRole(user.id, task.projectId);
  const collabIds = task.collaborators.map((c) => c.userId);
  if (!canSeeProjectTask(user.globalRole, role, task, collabIds, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ task });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectRole(user.id, existing.projectId);
  const collabs = await prisma.taskCollaborator.findMany({
    where: { taskId },
    select: { userId: true },
  });
  const collabIds = collabs.map((c) => c.userId);
  if (!canSeeProjectTask(user.globalRole, role, existing, collabIds, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.parentId !== undefined) data.parentId = d.parentId;
  if (d.status !== undefined) data.status = d.status;
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.assigneeId !== undefined) data.assigneeId = d.assigneeId;
  if (d.startTime !== undefined) data.startTime = d.startTime ? new Date(d.startTime) : null;
  if (d.deadline !== undefined) data.deadline = d.deadline ? new Date(d.deadline) : null;
  if (d.estimatedHours !== undefined) data.estimatedHours = d.estimatedHours;
  if (d.actualHours !== undefined) data.actualHours = d.actualHours;
  if (d.tags !== undefined) data.tags = d.tags;

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      collaborators: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  if (d.status !== undefined && d.status !== existing.status) {
    await logTaskHistory({
      taskId,
      userId: user.id,
      action: "status",
      field: "status",
      oldValue: existing.status,
      newValue: d.status,
    });
    const watchers = new Set<string>();
    if (task.assigneeId) watchers.add(task.assigneeId);
    if (existing.assigneeId) watchers.add(existing.assigneeId);
    collabIds.forEach((id) => watchers.add(id));
    watchers.delete(user.id);
    await prisma.notification.createMany({
      data: [...watchers].map((uid) => ({
        userId: uid,
        type: "STATUS_CHANGE" as const,
        title: "任务状态更新",
        body: `${existing.title} → ${d.status}`,
        taskId,
        projectId: existing.projectId,
      })),
    });
  }

  if (d.assigneeId !== undefined && d.assigneeId && d.assigneeId !== existing.assigneeId) {
    await prisma.notification.create({
      data: {
        userId: d.assigneeId,
        type: "ASSIGNMENT",
        title: "你被指派为负责人",
        body: task.title,
        taskId,
        projectId: existing.projectId,
      },
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectRole(user.id, existing.projectId);
  const visible = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, taskVisibilityWhere(existing.projectId, user.id, user.globalRole, role)] },
  });
  if (!visible && user.globalRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.globalRole === "MEMBER" && role !== "ADMIN" && role !== "MANAGER") {
    if (existing.createdById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await prisma.task.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
