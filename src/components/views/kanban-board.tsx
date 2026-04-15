"use client";

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  rectIntersection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status-styles";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type KanbanTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  deadline: string | null;
  assignee: { name: string | null } | null;
};

const columns: TaskStatus[] = ["todo", "doing", "blocked", "review", "done"];

export function KanbanBoard({
  projectId,
  tasks,
  onOpenTask,
}: {
  projectId: string;
  tasks: KanbanTask[];
  onOpenTask: (id: string) => void;
}) {
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const grouped = useMemo(() => {
    const m = new Map<TaskStatus, KanbanTask[]>();
    columns.forEach((c) => m.set(c, []));
    tasks.forEach((t) => {
      m.get(t.status)?.push(t);
    });
    return m;
  }, [tasks]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = String(over.id) as TaskStatus;
    if (!columns.includes(newStatus)) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t || t.status === newStatus) return;
    updateStatus.mutate({ id: taskId, status: newStatus });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={onDragEnd}>
      <div className="grid h-[calc(100vh-8rem)] grid-cols-5 gap-3">
        {columns.map((col) => (
          <KanbanColumn
            key={col}
            columnId={col}
            title={col.toUpperCase()}
            onOpenTask={onOpenTask}
            items={grouped.get(col) ?? []}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  columnId,
  title,
  items,
  onOpenTask,
}: {
  columnId: TaskStatus;
  title: string;
  items: KanbanTask[];
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 flex-col rounded-lg border bg-card/30 ${
        isOver ? "border-primary/50 ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}{" "}
        <span className="text-[10px] font-normal">({items.length})</span>
      </div>
      <div className="min-h-[200px] flex-1 space-y-2 overflow-auto p-2">
        {items.map((t) => (
          <DraggableTask key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />
        ))}
      </div>
    </div>
  );
}

function DraggableTask({ task, onOpen }: { task: KanbanTask; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.6 : 1,
      }
    : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen()}
      className={`w-full rounded-md border bg-background p-2 text-left text-sm shadow-sm hover:border-primary/40 ${
        task.status === "blocked" ? "border-destructive ring-1 ring-destructive/40" : "border-border"
      }`}
    >
      <div className="line-clamp-2 font-medium leading-snug">{task.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge variant={statusBadgeVariant(task.status)} className="text-[10px]">
          {task.priority}
        </Badge>
        {task.assignee?.name ? (
          <span className="text-[10px] text-muted-foreground">{task.assignee.name}</span>
        ) : null}
      </div>
    </button>
  );
}
