import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { canSeeProjectTask } from "@/lib/permissions";
import { z } from "zod";

const mentionRegex = /@([\w.-]+@[\w.-]+\.\w+)/g;

const postSchema = z.object({
  body: z.string().min(1).max(10000),
  parentId: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { collaborators: { select: { userId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectRole(user.id, task.projectId);
  const collabIds = task.collaborators.map((c) => c.userId);
  if (!canSeeProjectTask(user.globalRole, role, task, collabIds, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const emails = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(mentionRegex);
  while ((m = re.exec(parsed.data.body)) !== null) {
    emails.add(m[1].toLowerCase());
  }

  const mentionedUsers =
    emails.size > 0
      ? await prisma.user.findMany({
          where: { email: { in: [...emails] } },
          select: { id: true, email: true },
        })
      : [];

  const comment = await prisma.comment.create({
    data: {
      taskId,
      userId: user.id,
      body: parsed.data.body,
      parentId: parsed.data.parentId,
      ...(mentionedUsers.length
        ? {
            mentions: {
              create: mentionedUsers.map((u) => ({ userId: u.id })),
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      mentions: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (mentionedUsers.length) {
    await prisma.notification.createMany({
      data: mentionedUsers
        .filter((u) => u.id !== user.id)
        .map((u) => ({
          userId: u.id,
          type: "MENTION" as const,
          title: "你在评论中被 @",
          body: parsed.data.body.slice(0, 200),
          taskId,
          projectId: task.projectId,
        })),
    });
  }

  return NextResponse.json({ comment });
}
