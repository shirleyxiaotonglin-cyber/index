"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusBadgeVariant } from "@/lib/status-styles";
import type { TaskRelationKind, TaskStatus } from "@prisma/client";
import { useState } from "react";

type Rel = {
  kind: TaskRelationKind;
  toTask?: { id: string; title: string; status: TaskStatus };
  fromTask?: { id: string; title: string; status: TaskStatus };
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  deadline: string | null;
  startTime: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  assignee: { id: string; name: string | null; email: string | null } | null;
  collaborators: { user: { id: string; name: string | null }; responsibility: string }[];
  relationsFrom: Rel[];
  relationsTo: Rel[];
  children: { id: string; title: string; status: TaskStatus }[];
  comments: {
    id: string;
    body: string;
    user: { name: string | null };
    replies: { id: string; body: string; user: { name: string | null } }[];
  }[];
  history: {
    id: string;
    action: string;
    field: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    user: { name: string | null } | null;
  }[];
  project: { id: string; name: string };
};

export function TaskDrawer({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [ai, setAi] = useState<{
    summary: string;
    progress: string;
    risks: string[];
    nextSteps?: string[];
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    enabled: !!taskId && open,
    queryFn: async () => {
      const r = await fetch(`/api/tasks/${taskId}`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ task: TaskDetail }>;
    },
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!taskId || !comment.trim()) return;
      await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment, parentId: replyTo ?? undefined }),
      });
    },
    onSuccess: () => {
      setComment("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });

  const delTask = useMutation({
    mutationFn: async () => {
      if (!taskId) return;
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onOpenChange(false);
    },
  });

  const runAi = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "task_summary", taskId }),
      });
      const j = (await r.json()) as { result?: typeof ai; error?: string };
      if (!r.ok) throw new Error(j.error || `AI 请求失败 ${r.status}`);
      if (!j.result) throw new Error("无分析结果");
      return j.result;
    },
    onSuccess: (data) => {
      setAi(data);
    },
  });

  const t = data?.task;

  function relSection(title: string, items: { label: string; status: TaskStatus }[]) {
    if (!items.length) return null;
    return (
      <div>
        <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">{title}</h4>
        <ul className="space-y-1 text-xs">
          {items.map((x, i) => (
            <li key={i}>
              <span className="rounded bg-muted px-1">{x.label}</span>{" "}
              <Badge variant={statusBadgeVariant(x.status)} className="text-[9px]">
                {x.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle className="pr-8 leading-snug">
            {isLoading ? "加载…" : t?.title ?? "任务"}
          </SheetTitle>
          <SheetDescription>
            {t ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
                <span className="text-muted-foreground">{t.project.name}</span>
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {t ? (
          <div className="mt-4 flex flex-1 flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => runAi.mutate()}>
                AI 任务分析
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm("确定删除该任务？")) delTask.mutate();
                }}
              >
                删除任务
              </Button>
            </div>
            {ai ? (
              <div className="w-full rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
                <div className="font-medium text-foreground">{ai.progress}</div>
                <p className="mt-1 text-muted-foreground">{ai.summary}</p>
                {ai.risks?.length ? (
                  <ul className="mt-2 list-disc pl-4 text-amber-200/90">
                    {ai.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {ai.nextSteps?.length ? (
                  <div className="mt-2 text-muted-foreground">
                    <strong className="text-foreground">建议下一步：</strong>
                    <ul className="list-disc pl-4">
                      {ai.nextSteps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">预计工时</span>
                <p>{t.estimatedHours != null ? `${t.estimatedHours} h` : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">实际工时</span>
                <p>{t.actualHours != null ? `${t.actualHours} h` : "—"}</p>
              </div>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">负责人</h4>
              <p>{t.assignee?.name ?? t.assignee?.email ?? "未分配"}</p>
            </div>

            <div>
              <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">协作分工</h4>
              <ul className="space-y-1">
                {t.collaborators.map((c) => (
                  <li key={c.user.id}>
                    <span className="font-medium">{c.user.name}</span>
                    <span className="text-muted-foreground"> — {c.responsibility}</span>
                  </li>
                ))}
              </ul>
            </div>

            {relSection(
              "阻塞下游 (BLOCKS)",
              t.relationsFrom.filter((r) => r.kind === "BLOCKS" && r.toTask).map((r) => ({
                label: r.toTask!.title,
                status: r.toTask!.status,
              })),
            )}
            {relSection(
              "被谁阻塞",
              t.relationsTo.filter((r) => r.kind === "BLOCKS" && r.fromTask).map((r) => ({
                label: r.fromTask!.title,
                status: r.fromTask!.status,
              })),
            )}
            {relSection(
              "依赖 (DEPENDS_ON)",
              t.relationsFrom.filter((r) => r.kind === "DEPENDS_ON" && r.toTask).map((r) => ({
                label: `依赖 → ${r.toTask!.title}`,
                status: r.toTask!.status,
              })),
            )}
            {relSection(
              "关联 (RELATED)",
              [
                ...t.relationsFrom.filter((r) => r.kind === "RELATED" && r.toTask).map((r) => ({
                  label: r.toTask!.title,
                  status: r.toTask!.status,
                })),
                ...t.relationsTo.filter((r) => r.kind === "RELATED" && r.fromTask).map((r) => ({
                  label: r.fromTask!.title,
                  status: r.fromTask!.status,
                })),
              ],
            )}

            <div>
              <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">子任务</h4>
              <ul className="space-y-1">
                {t.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(c.status)} className="text-[10px]">
                      {c.status}
                    </Badge>
                    {c.title}
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div>
              <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">评论与回复</h4>
              <div className="space-y-2">
                {t.comments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border/60 p-2">
                    <div className="text-xs text-muted-foreground">{c.user.name}</div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 text-[10px]"
                      onClick={() => setReplyTo(c.id)}
                    >
                      回复
                    </Button>
                    {c.replies?.map((r) => (
                      <div key={r.id} className="ml-3 mt-2 border-l pl-2 text-xs">
                        <span className="text-muted-foreground">{r.user.name}</span>
                        <div>{r.body}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {replyTo ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  回复中…{" "}
                  <button type="button" className="text-primary" onClick={() => setReplyTo(null)}>
                    取消
                  </button>
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="写评论，支持 @email@domain.com"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <Button size="sm" onClick={() => addComment.mutate()} disabled={!comment.trim()}>
                  发送
                </Button>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">历史</h4>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
                {t.history.map((h) => (
                  <li key={h.id}>
                    {format(new Date(h.createdAt), "yyyy-MM-dd HH:mm")} {h.user?.name ?? "系统"}{" "}
                    {h.action}
                    {h.field ? ` · ${h.field}` : ""}
                    {h.newValue ? ` → ${h.newValue}` : ""}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-xs text-muted-foreground">
              开始：{t.startTime ? format(new Date(t.startTime), "yyyy-MM-dd") : "未设置"} · 截止：
              {t.deadline ? format(new Date(t.deadline), "yyyy-MM-dd") : "未设置"}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
