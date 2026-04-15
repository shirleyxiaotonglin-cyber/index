import { prisma } from "@/lib/db";

export async function logTaskHistory(data: {
  taskId: string;
  userId?: string | null;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}) {
  await prisma.taskHistory.create({
    data: {
      taskId: data.taskId,
      userId: data.userId,
      action: data.action,
      field: data.field,
      oldValue: data.oldValue,
      newValue: data.newValue,
    },
  });
}
