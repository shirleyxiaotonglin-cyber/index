import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/api-context";
import { z } from "zod";

const joinSchema = z.object({
  projectId: z.string().min(1, "projectId required"),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, archived: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.archived) {
    return NextResponse.json({ error: "Project archived" }, { status: 400 });
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: user.id } },
    create: { projectId, userId: user.id, role: "MEMBER" },
    update: {},
  });

  return NextResponse.json({ ok: true, project });
}

