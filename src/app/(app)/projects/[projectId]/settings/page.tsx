"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectRole } from "@prisma/client";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");

  const { data: projectData } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        project: { id: string; name: string; description: string | null; archived: boolean };
      }>;
    },
  });

  useEffect(() => {
    const p = projectData?.project;
    if (p) {
      setName(p.name);
      setDescription(p.description ?? "");
    }
  }, [projectData]);

  const { data: membersData } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`);
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{
        members: {
          id: string;
          userId: string;
          role: ProjectRole;
          user: { email: string; name: string | null };
        }[];
      }>;
    },
  });

  const saveProject = useMutation({
    mutationFn: async () => {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description || null }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const archive = useMutation({
    mutationFn: async (archived: boolean) => {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      setEmail("");
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: ProjectRole }) => {
      await fetch(`/api/projects/${projectId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  const p = projectData?.project;

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground">
          项目
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/project/${projectId}`} className="hover:text-foreground">
          工作区
        </Link>
        <span className="mx-1">/</span>
        设置
      </div>
      <h1 className="text-2xl font-semibold">项目设置</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>名称</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>描述</Label>
            <Textarea className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button onClick={() => saveProject.mutate()} disabled={!p || saveProject.isPending || !name.trim()}>
            保存
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => p && archive.mutate(!p.archived)} disabled={!p}>
              {p?.archived ? "取消归档" : "归档项目"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成员管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="通过邮箱添加成员（须已注册）"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="max-w-xs"
            />
            <Button onClick={() => addMember.mutate()} disabled={!email.trim()}>
              添加
            </Button>
          </div>
          <div className="space-y-2">
            {membersData?.members.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{m.user.name || m.user.email}</div>
                  <div className="text-xs text-muted-foreground">{m.user.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onValueChange={(v) => updateRole.mutate({ userId: m.userId, role: v as ProjectRole })}
                  >
                    <SelectTrigger className="h-8 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["ADMIN", "MANAGER", "MEMBER"] as ProjectRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("移除此成员？")) removeMember.mutate(m.userId);
                    }}
                  >
                    移除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
