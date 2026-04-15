import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { canManageProject } from "@/lib/permissions";
import { z } from "zod";
import { ProjectRole } from "@prisma/client";

const postSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(ProjectRole).optional(),
});

const patchSchema = z.object({
  userId: z.string(),
  role: z.nativeEnum(ProjectRole),
});

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

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: { id: true, email: true, name: true, image: true, globalRole: true } },
    },
  });
  return NextResponse.json({ members });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const myRole = await getProjectRole(user.id, projectId);
  if (!canManageProject(myRole, user.globalRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const m = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: target.id } },
    create: {
      projectId,
      userId: target.id,
      role: parsed.data.role ?? "MEMBER",
    },
    update: { role: parsed.data.role ?? undefined },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  return NextResponse.json({ member: m });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const myRole = await getProjectRole(user.id, projectId);
  if (!canManageProject(myRole, user.globalRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const m = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId: parsed.data.userId } },
    data: { role: parsed.data.role },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return NextResponse.json({ member: m });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const myRole = await getProjectRole(user.id, projectId);
  if (!canManageProject(myRole, user.globalRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  return NextResponse.json({ ok: true });
}
