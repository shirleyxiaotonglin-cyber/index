"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Stat = {
  projectId: string;
  total: number;
  done: number;
  blocked: number;
  overdue: number;
  completionRate: number;
  healthScore: number;
  load: { assigneeId: string | null; count: number }[];
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ projects: { id: string; name: string }[]; stats: Stat[] }>;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">加载仪表盘…</div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">总览</h1>
          <p className="text-sm text-muted-foreground">
            项目进度、阻塞与延期 — 管理层一屏掌握
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/projects">项目管理</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/ai">AI 控制中心</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.stats.map((s) => {
          const proj = data.projects.find((p) => p.id === s.projectId);
          return (
            <Card key={s.projectId} className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{proj?.name ?? s.projectId}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">任务 {s.total}</Badge>
                  <Badge variant="done">完成 {s.done}</Badge>
                  <Badge variant="blocked">阻塞 {s.blocked}</Badge>
                  <Badge variant="outline">延期 {s.overdue}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">完成率</span>
                  <span className="font-mono text-lg">{s.completionRate}%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">健康度</span>
                  <span className="font-mono text-lg text-primary">{s.healthScore}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  待办分布：{s.load.filter((l) => l.assigneeId).length} 位负责人有待办任务
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--status-done))]"
                    style={{ width: `${Math.min(100, s.completionRate)}%` }}
                  />
                </div>
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href={`/project/${s.projectId}`}>进入项目</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data.stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          暂无项目数据。请先创建项目并加入成员。
        </p>
      ) : null}
    </div>
  );
}
