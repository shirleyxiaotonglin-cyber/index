import type { GlobalRole, ProjectRole, Task } from "@prisma/client";

export function canSeeProjectTask(
  globalRole: GlobalRole,
  projectRole: ProjectRole | null,
  task: Pick<Task, "createdById" | "assigneeId">,
  collaboratorUserIds: string[],
  userId: string,
): boolean {
  if (globalRole === "ADMIN") return true;
  if (projectRole === "ADMIN" || projectRole === "MANAGER") return true;
  if (task.createdById === userId) return true;
  if (task.assigneeId === userId) return true;
  if (collaboratorUserIds.includes(userId)) return true;
  return false;
}

export function canManageProject(projectRole: ProjectRole | null, globalRole: GlobalRole) {
  if (globalRole === "ADMIN") return true;
  return projectRole === "ADMIN" || projectRole === "MANAGER";
}
