"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status-styles";
import { cn } from "@/lib/utils";

export type TreeTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  parentId: string | null;
  assignee: { name: string | null } | null;
};

type Node = TreeTask & { children: Node[] };

function buildTree(tasks: TreeTask[]): Node[] {
  const map = new Map<string, Node>();
  tasks.forEach((t) => {
    map.set(t.id, { ...t, children: [] });
  });
  const roots: Node[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function summarizeStatus(children: Node[], self: TaskStatus): TaskStatus {
  if (children.length === 0) return self;
  const set = new Set(children.map((c) => c.status));
  if (set.size === 1 && children[0]) return children[0].status;
  return self;
}

function Row({
  node,
  depth,
  onOpen,
}: {
  node: Node;
  depth: number;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const roll = summarizeStatus(node.children, node.status);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
          depth > 0 && "ml-4 border-l border-border pl-3",
        )}
        style={{ marginLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-muted-foreground"
            onClick={() => setOpen(!open)}
            aria-label="toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(node.id)}>
          <span className="font-medium">{node.title}</span>
        </button>
        <Badge variant={statusBadgeVariant(node.status)} className="text-[10px]">
          {node.status}
        </Badge>
        {hasChildren ? (
          <span className="text-[10px] text-muted-foreground">汇总: {roll}</span>
        ) : null}
        {node.assignee?.name ? (
          <span className="text-[10px] text-muted-foreground">{node.assignee.name}</span>
        ) : null}
      </div>
      {hasChildren && open ? (
        <div>
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TreeView({ tasks, onOpenTask }: { tasks: TreeTask[]; onOpenTask: (id: string) => void }) {
  const roots = buildTree(tasks);
  return (
    <div className="rounded-lg border border-border bg-card/20 p-3">
      {roots.map((r) => (
        <Row key={r.id} node={r} depth={0} onOpen={onOpenTask} />
      ))}
    </div>
  );
}
