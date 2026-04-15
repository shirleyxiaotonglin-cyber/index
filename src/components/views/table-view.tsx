"use client";

import { useMemo, useState } from "react";
import { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type TableTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  deadline: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  assignee: { name: string | null } | null;
  tags: string[];
};

type SortKey = "title" | "status" | "priority" | "deadline";

export function TableView({
  projectId,
  tasks,
  onOpenTask,
}: {
  projectId: string;
  tasks: TableTask[];
  onOpenTask: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "deadline",
    dir: "asc",
  });
  const [filter, setFilter] = useState("");

  const sorted = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let rows = tasks.filter(
      (t) =>
        !f ||
        t.title.toLowerCase().includes(f) ||
        t.tags.some((x) => x.toLowerCase().includes(f)),
    );
    rows = [...rows].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const va = a[sort.key];
      const vb = b[sort.key];
      if (sort.key === "deadline") {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return (da - db) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });
    return rows;
  }, [tasks, sort, filter]);

  const patch = useMutation({
    mutationFn: async (payload: {
      id: string;
      title?: string;
      status?: TaskStatus;
      actualHours?: number | null;
    }) => {
      await fetch(`/api/tasks/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", projectId] }),
  });

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="筛选标题 / 标签…"
          className="h-8 max-w-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">共 {sorted.length} 条</span>
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">
                <button type="button" onClick={() => toggleSort("title")}>
                  标题 {sort.key === "title" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="p-2">
                <button type="button" onClick={() => toggleSort("status")}>
                  状态 {sort.key === "status" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="p-2">
                <button type="button" onClick={() => toggleSort("priority")}>
                  优先级 {sort.key === "priority" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="p-2">
                <button type="button" onClick={() => toggleSort("deadline")}>
                  截止 {sort.key === "deadline" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="p-2">负责人</th>
              <th className="p-2">预计h</th>
              <th className="p-2">实际h</th>
              <th className="p-2">标签</th>
              <th className="p-2 w-36">快速编辑</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-b border-border/60 hover:bg-muted/20">
                <td className="p-2">
                  <button
                    type="button"
                    className="text-left font-medium hover:text-primary"
                    onClick={() => onOpenTask(t.id)}
                  >
                    {t.title}
                  </button>
                </td>
                <td className="p-2">
                  <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
                </td>
                <td className="p-2 font-mono text-xs">{t.priority}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {t.deadline ? new Date(t.deadline).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 text-xs">{t.assignee?.name ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{t.estimatedHours ?? "—"}</td>
                <td className="p-2">
                  <Input
                    className="h-7 w-16 text-xs"
                    type="number"
                    defaultValue={t.actualHours ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value;
                      const n = v === "" ? null : parseFloat(v);
                      if (n !== t.actualHours && (n === null || !Number.isNaN(n))) {
                        patch.mutate({ id: t.id, actualHours: n });
                      }
                    }}
                  />
                </td>
                <td className="p-2 text-xs text-muted-foreground">{t.tags.join(", ") || "—"}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {(["doing", "review", "done"] as TaskStatus[]).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        className="h-7 px-1.5 text-[10px]"
                        onClick={() => patch.mutate({ id: t.id, status: s })}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
