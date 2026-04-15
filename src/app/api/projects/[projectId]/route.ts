import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { canManageProject } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  archived: z.boolean().optional(),
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project, projectRole: role });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const role = await getProjectRole(user.id, projectId);
  if (!canManageProject(role, user.globalRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...("name" in parsed.data && parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...("description" in parsed.data ? { description: parsed.data.description } : {}),
      ...("archived" in parsed.data && parsed.data.archived !== undefined
        ? { archived: parsed.data.archived }
        : {}),
    },
  });

  return NextResponse.json({ project });
}
