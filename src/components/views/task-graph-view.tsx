"use client";

import { useMemo } from "react";
import type { TaskStatus } from "@prisma/client";

const STATUS_FILL: Record<TaskStatus, string> = {
  todo: "#eab308",
  doing: "#3b82f6",
  blocked: "#ef4444",
  review: "#a855f7",
  done: "#22c55e",
};

type Node = { id: string; label: string; status: TaskStatus };
type Edge = { id: string; source: string; target: string; kind: string; tree?: boolean };

const KIND_COLOR: Record<string, string> = {
  PARENT: "#64748b",
  BLOCKS: "#ef4444",
  DEPENDS_ON: "#3b82f6",
  RELATED: "#a855f7",
};

export function TaskGraphView({
  nodes,
  edges,
  onOpenTask,
}: {
  nodes: Node[];
  edges: Edge[];
  onOpenTask: (id: string) => void;
}) {
  const { positions, w, h } = useMemo(() => {
    const n = nodes.length || 1;
    const cx = 400;
    const cy = 220;
    const r = Math.min(180, 60 + n * 8);
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((node, i) => {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;
      pos.set(node.id, {
        x: cx + r * Math.cos(ang),
        y: cy + r * Math.sin(ang),
      });
    });
    return { positions: pos, w: 800, h: 440 };
  }, [nodes]);

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card/20 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        图例：灰线=父子 · 红=阻塞 · 蓝=依赖 · 紫=关联
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
          return (
            <g key={node.id} className="cursor-pointer" onClick={() => onOpenTask(node.id)}>
              <circle cx={p.x} cy={p.y} r={22} fill={STATUS_FILL[node.status] ?? "#64748b"} opacity={0.95} />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-[9px] font-medium"
                style={{ pointerEvents: "none" }}
              >
                {node.label.slice(0, 4)}
              </text>
              <text
                x={p.x}
                y={p.y + 38}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
                style={{ maxWidth: 80 }}
              >
                {node.label.length > 14 ? `${node.label.slice(0, 14)}…` : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
