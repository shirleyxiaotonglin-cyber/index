import type { TaskStatus } from "@prisma/client";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  doing: "Doing",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export function statusBadgeVariant(
  status: TaskStatus,
): "todo" | "doing" | "blocked" | "review" | "done" {
  return status;
}

/** Timeline bar colors (CSS hsl tokens) */
export function statusBarClass(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "bg-[hsl(var(--status-done))]";
    case "doing":
      return "bg-[hsl(var(--status-doing))]";
    case "todo":
      return "bg-[hsl(var(--status-todo))]";
    case "blocked":
      return "bg-[hsl(var(--status-blocked))]";
    case "review":
      return "bg-[hsl(var(--status-review))]";
    default:
      return "bg-[hsl(var(--status-idle))]";
  }
}
