import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { canSeeProjectTask } from "@/lib/permissions";
import { TaskRelationKind } from "@prisma/client";
import { z } from "zod";

const postSchema = z.object({
  toTaskId: z.string(),
  kind: z.nativeEnum(TaskRelationKind),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId: fromTaskId } = await ctx.params;

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { toTaskId, kind } = parsed.data;
  if (fromTaskId === toTaskId) {
    return NextResponse.json({ error: "Cannot relate to self" }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    prisma.task.findUnique({
      where: { id: fromTaskId },
      include: { collaborators: { select: { userId: true } } },
    }),
    prisma.task.findUnique({
      where: { id: toTaskId },
      include: { collaborators: { select: { userId: true } } },
    }),
  ]);

  if (!from || !to || from.projectId !== to.projectId) {
    return NextResponse.json({ error: "Invalid tasks" }, { status: 400 });
  }

  const role = await getProjectRole(user.id, from.projectId);
  const can = (t: NonNullable<typeof from>) =>
    canSeeProjectTask(
      user.globalRole,
      role,
      t,
      t.collaborators.map((c) => c.userId),
      user.id,
    );
  if (!can(from) || !can(to)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rel = await prisma.taskRelation.create({
    data: {
      projectId: from.projectId,
      fromTaskId,
      toTaskId,
      kind,
    },
    include: {
      fromTask: { select: { id: true, title: true, status: true } },
      toTask: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json({ relation: rel });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId: fromTaskId } = await ctx.params;

  const { searchParams } = new URL(req.url);
  const toTaskId = searchParams.get("toTaskId");
  const kind = searchParams.get("kind") as TaskRelationKind | null;
  if (!toTaskId || !kind) {
    return NextResponse.json({ error: "toTaskId and kind required" }, { status: 400 });
  }

  const from = await prisma.task.findUnique({
    where: { id: fromTaskId },
    include: { collaborators: { select: { userId: true } } },
  });
  if (!from) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectRole(user.id, from.projectId);
  if (
    !canSeeProjectTask(
      user.globalRole,
      role,
      from,
      from.collaborators.map((c) => c.userId),
      user.id,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.taskRelation.deleteMany({
    where: { fromTaskId, toTaskId, kind },
  });
  return NextResponse.json({ ok: true });
}
