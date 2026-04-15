import type { GlobalRole, Prisma, ProjectRole } from "@prisma/client";

/** Visibility filter for tasks within a project (Member sees own scope; Manager+ sees all). */
export function taskVisibilityWhere(
  projectId: string,
  userId: string,
  globalRole: GlobalRole,
  projectRole: ProjectRole | null,
): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { projectId };
  if (globalRole === "ADMIN") return base;
  if (projectRole === "ADMIN" || projectRole === "MANAGER") return base;
  return {
    projectId,
    OR: [
      { createdById: userId },
      { assigneeId: userId },
      { collaborators: { some: { userId } } },
      { comments: { some: { mentions: { some: { userId } } } } },
    ],
  };
}

export function canAccessProject(
  globalRole: GlobalRole,
  projectRole: ProjectRole | null,
): boolean {
  if (globalRole === "ADMIN") return true;
  return projectRole !== null;
}
