"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status-styles";
import type { TaskStatus } from "@prisma/client";

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: Date | string;
  project: { id: string; name: string };
  assignee: { id: string; name: string | null } | null;
};

function TaskList({ title, items }: { title: string; items: TaskRow[] }) {
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无</p>
        ) : (
          items.map((t) => (
            <Link
              key={t.id}
              href={`/project/${t.project.id}?task=${t.id}`}
              className="flex items-start justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.project.name}</div>
              </div>
              <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function MyTasksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me-tasks"],
    queryFn: async () => {
      const r = await fetch("/api/me/tasks");
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        created: TaskRow[];
        assigned: TaskRow[];
        participating: TaskRow[];
        mentioned: TaskRow[];
        dueSoon: TaskRow[];
        overdue: TaskRow[];
      }>;
    },
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">加载我的任务…</div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的任务</h1>
        <p className="text-sm text-muted-foreground">
          创建、负责、协作、@提及、即将到期与延期（仅与您相关的任务）
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TaskList title="我创建的" items={data.created} />
        <TaskList title="我负责的" items={data.assigned} />
        <TaskList title="我参与的（协作）" items={data.participating} />
        <TaskList title="@ 提及我的" items={data.mentioned} />
        <TaskList title="即将到期（≤3 天）" items={data.dueSoon} />
        <TaskList title="已延期" items={data.overdue} />
      </div>
    </div>
  );
}
