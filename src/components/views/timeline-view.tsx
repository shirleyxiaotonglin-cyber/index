"use client";

import { addDays, differenceInCalendarDays, min as minDate, max as maxDate } from "date-fns";
import { TaskStatus } from "@prisma/client";
import { statusBarClass } from "@/lib/status-styles";

export type TimelineTask = {
  id: string;
  title: string;
  status: TaskStatus;
  startTime: string | null;
  deadline: string | null;
};

const DAY_W = 28;

export function TimelineView({
  tasks,
  onOpenTask,
}: {
  tasks: TimelineTask[];
  onOpenTask: (id: string) => void;
}) {
  const now = new Date();
  const withRange = tasks.map((t) => {
    const start = t.startTime ? new Date(t.startTime) : t.deadline ? addDays(new Date(t.deadline), -7) : now;
    const end = t.deadline ? new Date(t.deadline) : addDays(start, 3);
    return { ...t, start, end };
  });

  const minT = withRange.length
    ? minDate(withRange.map((x) => x.start))
    : addDays(now, -7);
  const maxT = withRange.length
    ? maxDate(withRange.map((x) => x.end))
    : addDays(now, 30);

  const totalDays = Math.max(14, differenceInCalendarDays(maxT, minT) + 1);
  const days = Array.from({ length: totalDays }, (_, i) => addDays(minT, i));

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card/20">
      <div className="min-w-[960px]">
        <div className="flex border-b border-border text-[10px] text-muted-foreground">
          <div className="w-48 shrink-0 border-r border-border p-2">任务</div>
          <div className="flex flex-1">
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="border-r border-border/60 px-1 py-1 text-center"
                style={{ width: DAY_W }}
              >
                {d.getMonth() + 1}/{d.getDate()}
              </div>
            ))}
          </div>
        </div>
        {withRange.map((t, idx) => {
          const left = Math.max(0, differenceInCalendarDays(t.start, minT));
          const span = Math.max(1, differenceInCalendarDays(t.end, t.start) + 1);
          return (
            <div
              key={t.id}
              className="flex border-b border-border/50"
              style={{ minHeight: 40 }}
            >
              <div className="w-48 shrink-0 border-r border-border p-2 text-xs">
                <button
                  type="button"
                  className="text-left font-medium hover:text-primary"
                  onClick={() => onOpenTask(t.id)}
                >
                  {t.title}
                </button>
                <div className="text-[10px] text-muted-foreground">L{idx + 1}</div>
              </div>
              <div className="relative flex-1 py-2">
                <div className="absolute inset-y-2 flex" style={{ left: left * DAY_W, width: span * DAY_W }}>
                  <div
                    className={`h-6 w-full rounded px-2 text-[10px] leading-6 text-white shadow ${statusBarClass(t.status)}`}
                  >
                    <span className="line-clamp-1">{t.title}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
