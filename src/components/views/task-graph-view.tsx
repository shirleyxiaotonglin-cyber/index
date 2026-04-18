"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import type { TaskStatus } from "@prisma/client";

const STATUS_FILL: Record<TaskStatus, string> = {
  todo: "#eab308",
  doing: "#3b82f6",
  blocked: "#ef4444",
  review: "#a855f7",
  done: "#22c55e",
};

const STATUS_ZH: Record<TaskStatus, string> = {
  todo: "待办",
  doing: "进行中",
  blocked: "阻塞",
  review: "评审",
  done: "完成",
};

type GraphNode = {
  id: string;
  label: string;
  status: TaskStatus;
  assigneeName?: string | null;
  assigneeImage?: string | null;
  collaboratorNames?: string[];
  deadline?: string | Date | null;
};
type Edge = { id: string; source: string; target: string; kind: string; tree?: boolean };

const KIND_COLOR: Record<string, string> = {
  PARENT: "#64748b",
  BLOCKS: "#ef4444",
  DEPENDS_ON: "#3b82f6",
  RELATED: "#a855f7",
};

function initials(n: string | null | undefined) {
  const s = (n ?? "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

export function TaskGraphView({
  nodes,
  edges,
  onOpenTask,
}: {
  nodes: GraphNode[];
  edges: Edge[];
  onOpenTask: (id: string) => void;
}) {
  const { positions, w, h } = useMemo(() => {
    const n = nodes.length || 1;
    const cx = 400;
    const cy = 260;
    const r = Math.min(180, 60 + n * 8);
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, i) => {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;
      pos.set(node.id, {
        x: cx + r * Math.cos(ang),
        y: cy + r * Math.sin(ang),
      });
    });
    return { positions: pos, w: 880, h: 520 };
  }, [nodes]);

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card/20 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        节点含任务名、状态、截止日与负责人；点击打开详情与讨论区。图例：灰=父子 · 红=阻塞 · 蓝=依赖 · 紫=关联
      </p>
      <svg width={w} height={h} className="mx-auto">
        {edges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const color = KIND_COLOR[e.kind] ?? "#64748b";
          const dash = e.tree ? "4 3" : e.kind === "RELATED" ? "2 4" : undefined;
          return (
            <line
              key={e.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={e.kind === "BLOCKS" ? 2.5 : 1.5}
              strokeDasharray={dash}
              markerEnd="url(#arrow)"
            />
          );
        })}
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#64748b" />
          </marker>
        </defs>
        {nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const ddl =
            node.deadline != null
              ? format(typeof node.deadline === "string" ? new Date(node.deadline) : node.deadline, "MM-dd")
              : "无截止";
          const stZh = STATUS_ZH[node.status] ?? node.status;
          const title =
            node.label.length > 18 ? `${node.label.slice(0, 18)}…` : node.label;
          const asg = node.assigneeName ?? "未指定";
          const cols =
            node.collaboratorNames?.length ? `协:${node.collaboratorNames.slice(0, 2).join("·")}` : "";
          return (
            <g key={node.id} className="cursor-pointer" onClick={() => onOpenTask(node.id)}>
              <circle cx={p.x} cy={p.y} r={26} fill={STATUS_FILL[node.status] ?? "#64748b"} opacity={0.95} />
              <text
                x={p.x}
                y={p.y + 5}
                textAnchor="middle"
                className="fill-white text-[11px] font-semibold"
                style={{ pointerEvents: "none" }}
              >
                {initials(node.assigneeName ?? node.label)}
              </text>
              <text
                x={p.x}
                y={p.y + 44}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-semibold"
                style={{ pointerEvents: "none" }}
              >
                {title}
              </text>
              <text
                x={p.x}
                y={p.y + 58}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
                style={{ pointerEvents: "none" }}
              >
                {stZh} · {ddl}
              </text>
              <text
                x={p.x}
                y={p.y + 70}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
                style={{ pointerEvents: "none" }}
              >
                {asg.length > 10 ? `${asg.slice(0, 10)}…` : asg}
                {cols ? ` ${cols.length > 12 ? `${cols.slice(0, 12)}…` : cols}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
