"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { KanbanBoard } from "@/components/views/kanban-board";
import { TreeView } from "@/components/views/tree-view";
import { TimelineView } from "@/components/views/timeline-view";
import { CalendarView } from "@/components/views/calendar-view";
import { TableView } from "@/components/views/table-view";
import { TaskGraphView } from "@/components/views/task-graph-view";
import { TaskDrawer } from "@/components/task/task-drawer";
import { CreateTaskDialog } from "@/components/project/create-task-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskStatus } from "@prisma/client";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VIEWS = ["kanban", "tree", "timeline", "calendar", "table", "graph"] as const;
type View = (typeof VIEWS)[number];

function isView(v: string | null): v is View {
  return !!v && (VIEWS as readonly string[]).includes(v);
}

export function ProjectWorkspace({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = isView(sp.get("view")) ? sp.get("view")! : "kanban";
  const taskId = sp.get("task");
  const assigneeFilter = sp.get("assignee") || "";
  const tagFilter = sp.get("tag") || "";
  const qFilter = sp.get("q") || "";

  const [createOpen, setCreateOpen] = useState(false);

  const { data: membersData } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        members: {
          userId: string;
          role: string;
          user: { id: string; name: string | null; email: string | null };
        }[];
      }>;
    },
  });

  const taskQueryUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (assigneeFilter) p.set("assigneeId", assigneeFilter);
    if (tagFilter) p.set("tag", tagFilter);
    if (qFilter) p.set("q", qFilter);
    const qs = p.toString();
    return `/api/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`;
  }, [projectId, assigneeFilter, tagFilter, qFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", projectId, assigneeFilter, tagFilter, qFilter],
    queryFn: async () => {
      const r = await fetch(taskQueryUrl);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        tasks: {
          id: string;
          title: string;
          status: TaskStatus;
          priority: string;
          parentId: string | null;
          deadline: string | null;
          startTime: string | null;
          tags: string[];
          estimatedHours: number | null;
          actualHours: number | null;
          assignee: { name: string | null } | null;
        }[];
      }>;
    },
  });

  const { data: graphData, isLoading: graphLoading } = useQuery({
    queryKey: ["graph", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/graph`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        nodes: { id: string; label: string; status: TaskStatus }[];
        edges: { id: string; source: string; target: string; kind: string; tree?: boolean }[];
      }>;
    },
    enabled: view === "graph",
  });

  function setParam(key: string, value: string | null) {
    const q = new URLSearchParams(sp.toString());
    if (value === null || value === "") q.delete(key);
    else q.set(key, value);
    router.push(`/project/${projectId}?${q.toString()}`);
  }

  function openTask(id: string | null) {
    setParam("task", id);
  }

  const tasks = data?.tasks ?? [];
  const members =
    membersData?.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
    })) ?? [];

  const allTags = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((x) => s.add(x)));
    return [...s].sort();
  }, [tasks]);

  return (
    <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              总览
            </Link>
            <span className="mx-1">/</span>
            <Link href="/projects" className="hover:text-foreground">
              项目
            </Link>
            <span className="mx-1">/</span>
            <span>{projectName}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{projectName}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${projectId}/settings`}>成员与设置</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/ai?projectId=${projectId}`}>AI 控制中心</Link>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            新建任务
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
        <div className="min-w-[140px]">
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">负责人</p>
          <Select
            value={assigneeFilter || "__all"}
            onValueChange={(v) => setParam("assignee", v === "__all" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[120px]">
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">标签</p>
          <Select value={tagFilter || "__all"} onValueChange={(v) => setParam("tag", v === "__all" ? null : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1">
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">搜索</p>
          <Input
            className="h-8 text-xs"
            placeholder="标题 / 描述"
            defaultValue={qFilter}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setParam("q", (e.target as HTMLInputElement).value || null);
              }
            }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["kanban", "看板"],
              ["tree", "树"],
              ["timeline", "时间线"],
              ["calendar", "日历"],
              ["table", "表格"],
              ["graph", "任务图谱"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={view === id ? "default" : "outline"}
              onClick={() => setParam("view", id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1">
          {isLoading && view !== "graph" ? (
            <div className="text-sm text-muted-foreground">加载任务…</div>
          ) : (
            <>
              {view === "kanban" ? (
                <KanbanBoard projectId={projectId} tasks={tasks} onOpenTask={(id) => openTask(id)} />
              ) : null}
              {view === "tree" ? (
                <TreeView tasks={tasks} onOpenTask={(id) => openTask(id)} />
              ) : null}
              {view === "timeline" ? (
                <TimelineView tasks={tasks} onOpenTask={(id) => openTask(id)} />
              ) : null}
              {view === "calendar" ? (
                <CalendarView tasks={tasks} onOpenTask={(id) => openTask(id)} />
              ) : null}
              {view === "table" ? (
                <TableView projectId={projectId} tasks={tasks} onOpenTask={(id) => openTask(id)} />
              ) : null}
              {view === "graph" ? (
                graphLoading ? (
                  <div className="text-sm text-muted-foreground">加载图谱…</div>
                ) : graphData ? (
                  <TaskGraphView
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                    onOpenTask={(id) => openTask(id)}
                  />
                ) : null
              ) : null}
            </>
          )}
        </div>
      </div>

      <CreateTaskDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        members={members}
      />

      <TaskDrawer
        taskId={taskId}
        open={!!taskId}
        onOpenChange={(o) => {
          if (!o) openTask(null);
        }}
      />
    </div>
  );
}
