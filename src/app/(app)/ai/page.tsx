"use client";

import { Suspense, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Kind =
  | "daily"
  | "weekly"
  | "project"
  | "project_deep"
  | "risk"
  | "risk_predict"
  | "workload"
  | "decompose"
  | "next_actions"
  | "retro"
  | "standup"
  | "executive_brief"
  | "task_summary";

function needsProjectId(kind: Kind): boolean {
  return kind !== "decompose" && kind !== "task_summary";
}

function AiInner() {
  const sp = useSearchParams();
  const defaultProject = sp.get("projectId") ?? "";
  const [projectId, setProjectId] = useState(defaultProject);
  const [taskId, setTaskId] = useState("");
  const [decomposeTitle, setDecomposeTitle] = useState("");
  const [results, setResults] = useState<Partial<Record<Kind, unknown>>>({});

  const run = useMutation({
    mutationFn: async ({ kind, title, taskId: tid }: { kind: Kind; title?: string; taskId?: string }) => {
      if (kind === "task_summary") {
        if (!tid?.trim()) throw new Error("需要 taskId");
      } else if (!projectId.trim() && kind !== "decompose") {
        throw new Error("需要 projectId");
      }
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          projectId: projectId.trim() || undefined,
          title: title?.trim() || undefined,
          taskId: tid?.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => null);
        const msg =
          errBody && typeof errBody === "object" && "error" in errBody
            ? String((errBody as { error: unknown }).error)
            : r.statusText;
        throw new Error(msg || "请求失败");
      }
      return r.json() as Promise<{ result: unknown }>;
    },
    onSuccess: (data, variables) => {
      setResults((prev) => ({ ...prev, [variables.kind]: data.result }));
    },
  });

  function cell(title: string, kind: Kind, extra?: ReactNode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {extra}
          <Button
            size="sm"
            onClick={() => run.mutate({ kind })}
            disabled={run.isPending || (needsProjectId(kind) && !projectId.trim())}
          >
            生成
          </Button>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
            {results[kind] ? JSON.stringify(results[kind], null, 2) : "—"}
          </pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI 控制中心</h1>
        <p className="text-sm text-muted-foreground">
          各模块优先走 OpenRouter（与会议纪要共用 <code className="text-xs">OPENROUTER_API_KEY</code>{" "}
          / <code className="text-xs">OPENROUTER_MODEL</code>）；失败时自动回退规则引擎。单任务摘要需填写 taskId。
        </p>
        {run.isError ? (
          <p className="text-sm text-destructive">{(run.error as Error)?.message ?? "出错"}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">项目上下文</CardTitle>
          <CardDescription>多数分析需要 projectId（从项目 URL 复制）</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="projectId"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {cell("每日进度", "daily")}
        {cell("周报", "weekly")}
        {cell("项目总结", "project")}
        {cell("项目深度总结（风险·瓶颈·效率）", "project_deep")}
        {cell("风险分析", "risk")}
        {cell("风险预测（延期·关键路径）", "risk_predict")}
        {cell("工作负载", "workload")}
        {cell("下一步行动（24h / 3d）", "next_actions")}
        {cell("复盘建议（做得好 / 待改进）", "retro")}
        {cell("站会要点", "standup")}
        {cell("管理层简报", "executive_brief")}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">单任务摘要</CardTitle>
          <CardDescription>基于任务详情生成要点、风险与下一步（需 taskId）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>taskId</Label>
          <Input
            placeholder="从任务详情或接口复制 task id"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="max-w-md font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={() => run.mutate({ kind: "task_summary", taskId })}
            disabled={run.isPending || !taskId.trim()}
          >
            生成
          </Button>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
            {results.task_summary ? JSON.stringify(results.task_summary, null, 2) : "—"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">任务拆解建议</CardTitle>
          <CardDescription>输入父任务标题，生成子任务与角色建议</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>任务标题</Label>
          <Input value={decomposeTitle} onChange={(e) => setDecomposeTitle(e.target.value)} className="max-w-md" />
          <Button
            size="sm"
            onClick={() => run.mutate({ kind: "decompose", title: decomposeTitle })}
            disabled={run.isPending || !decomposeTitle.trim()}
          >
            拆解
          </Button>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs">
            {results.decompose ? JSON.stringify(results.decompose, null, 2) : "—"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AiPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载…</div>}>
      <AiInner />
    </Suspense>
  );
}
