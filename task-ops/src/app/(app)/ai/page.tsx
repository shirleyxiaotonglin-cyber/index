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
  | "decompose";

function AiInner() {
  const sp = useSearchParams();
  const defaultProject = sp.get("projectId") ?? "";
  const [projectId, setProjectId] = useState(defaultProject);
  const [decomposeTitle, setDecomposeTitle] = useState("");
  const [results, setResults] = useState<Partial<Record<Kind, unknown>>>({});

  const run = useMutation({
    mutationFn: async ({ kind, title }: { kind: Kind; title?: string }) => {
      if (!projectId.trim() && kind !== "decompose") throw new Error("需要 projectId");
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          projectId: projectId.trim() || undefined,
          title: title?.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `请求失败 ${r.status}`);
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
            disabled={run.isPending || (kind !== "decompose" && !projectId.trim())}
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
          配置环境变量 <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> 后，由{" "}
          <strong>gpt-4o-mini</strong> 生成；未配置时自动使用规则引擎。
        </p>
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
      </div>

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
