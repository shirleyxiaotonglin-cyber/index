import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { GlobalRole, ProjectRole } from "@prisma/client";

export type ApiUser = {
  id: string;
  email: string | null;
  globalRole: GlobalRole;
};

export async function requireUser(): Promise<ApiUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, globalRole: true },
  });
  if (!user) return null;
  return user;
}

export async function getProjectRole(
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}
