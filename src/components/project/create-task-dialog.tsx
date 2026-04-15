"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { TaskPriority, TaskStatus } from "@prisma/client";

export function CreateTaskDialog({
  projectId,
  open,
  onOpenChange,
  members,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  members: { userId: string; name: string | null; email: string | null }[];
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("P2");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description || undefined,
          status,
          priority,
          assigneeId: assigneeId || null,
          tags: tags
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
          estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["graph", projectId] });
      onOpenChange(false);
      setTitle("");
      setDescription("");
      setTags("");
      setEstimatedHours("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建任务</DialogTitle>
          <DialogDescription>填写任务信息，保存后可在看板与图谱中查看。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>标题 *</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>描述</Label>
            <Textarea className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>状态</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["todo", "doing", "blocked", "review", "done"] as TaskStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>优先级</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["P0", "P1", "P2", "P3"] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>负责人</Label>
            <Select value={assigneeId || "__none"} onValueChange={(v) => setAssigneeId(v === "__none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="未分配" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">未分配</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>标签（逗号分隔）</Label>
            <Input className="mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="frontend,urgent" />
          </div>
          <div>
            <Label>预计工时（小时）</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              step={0.5}
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
            />
          </div>
          <Button
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="w-full"
          >
            创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
