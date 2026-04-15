import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";
import { logTaskHistory } from "@/lib/history";
import { z } from "zod";
import { Prisma, QueryMode, TaskPriority, TaskStatus } from "@prisma/client";

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeId: z.string().nullable().optional(),
  startTime: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  estimatedHours: z.number().nonnegative().nullable().optional(),
  actualHours: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).optional(),
  collaboratorIds: z
    .array(
      z.object({
        userId: z.string(),
        responsibility: z.string(),
      }),
    )
    .optional(),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const role = await getProjectRole(user.id, projectId);
  if (user.globalRole !== "ADMIN" && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as TaskStatus | null;
  const assigneeId = searchParams.get("assigneeId");
  const tag = searchParams.get("tag")?.trim();
  const q = searchParams.get("q")?.trim();

  const visibility = taskVisibilityWhere(projectId, user.id, user.globalRole, role);
  const searchFilter: Prisma.TaskWhereInput | null = q
    ? {
        OR: [
          { title: { contains: q, mode: QueryMode.insensitive } },
          { description: { contains: q, mode: QueryMode.insensitive } },
        ],
      }
    : null;
  const tagFilter: Prisma.TaskWhereInput | null = tag ? { tags: { has: tag } } : null;

  const andFilters: Prisma.TaskWhereInput[] = [visibility];
  if (status) andFilters.push({ status });
  if (assigneeId) andFilters.push({ assigneeId });
  if (searchFilter) andFilters.push(searchFilter);
  if (tagFilter) andFilters.push(tagFilter);
  const where: Prisma.TaskWhereInput = { AND: andFilters };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      collaborators: { include: { user: { select: { id: true, name: true } } } },
      relationsFrom: {
        include: { toTask: { select: { id: true, title: true, status: true } } },
      },
      relationsTo: {
        include: { fromTask: { select: { id: true, title: true, status: true } } },
      },
    },
  });

  return NextResponse.json({ tasks });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const role = await getProjectRole(user.id, projectId);
  if (user.globalRole !== "ADMIN" && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const task = await prisma.task.create({
    data: {
      title: d.title,
      description: d.description,
      projectId,
      parentId: d.parentId ?? undefined,
      status: d.status ?? "todo",
      priority: d.priority ?? "P2",
      assigneeId: d.assigneeId ?? undefined,
      createdById: user.id,
      startTime: d.startTime ? new Date(d.startTime) : undefined,
      deadline: d.deadline ? new Date(d.deadline) : undefined,
      estimatedHours: d.estimatedHours ?? undefined,
      actualHours: d.actualHours ?? undefined,
      tags: d.tags ?? [],
      collaborators: d.collaboratorIds?.length
        ? {
            create: d.collaboratorIds.map((c) => ({
              userId: c.userId,
              responsibility: c.responsibility,
            })),
          }
        : undefined,
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      collaborators: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  await logTaskHistory({
    taskId: task.id,
    userId: user.id,
    action: "create",
    field: "title",
    newValue: task.title,
  });

  if (task.assigneeId && task.assigneeId !== user.id) {
    await prisma.notification.create({
      data: {
        userId: task.assigneeId,
        type: "ASSIGNMENT",
        title: "新任务分配",
        body: task.title,
        taskId: task.id,
        projectId,
      },
    });
  }

  return NextResponse.json({ task });
}
