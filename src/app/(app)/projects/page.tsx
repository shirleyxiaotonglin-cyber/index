"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [joinId, setJoinId] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects");
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        projects: { id: string; name: string; description: string | null; archived: boolean; _count: { tasks: number } }[];
      }>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc || undefined }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
      setDesc("");
    },
  });

  const join = useMutation({
    mutationFn: async (projectId: string) => {
      const r = await fetch("/api/projects/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "加入失败");
      return j as { ok: true; project: { id: string; name: string } };
    },
    onSuccess: async (res) => {
      setJoinMsg(`已加入项目：${res.project.name}`);
      setJoinId("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/project/${res.project.id}`);
    },
    onError: (e) => {
      setJoinMsg(e instanceof Error ? e.message : "加入失败");
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">加载项目…</div>;
  }

  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">项目</h1>
          <p className="text-sm text-muted-foreground">创建、进入项目或管理成员</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>创建项目</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建项目</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div>
                <Label>名称</Label>
                <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>描述</Label>
                <Textarea className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                创建
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">加入项目（跨设备）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full max-w-sm"
              placeholder="输入项目 ID"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!joinId.trim() || join.isPending}
              onClick={() => {
                setJoinMsg(null);
                join.mutate(joinId.trim());
              }}
            >
              {join.isPending ? "加入中..." : "加入并打开"}
            </Button>
          </div>
          {joinMsg ? <p className="text-sm text-muted-foreground">{joinMsg}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <Card key={p.id} className={p.archived ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="line-clamp-2">{p.description || "无描述"}</p>
              <p className="text-xs">任务数：{p._count.tasks}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/project/${p.id}`}>进入工作区</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/projects/${p.id}/settings`}>成员与设置</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
