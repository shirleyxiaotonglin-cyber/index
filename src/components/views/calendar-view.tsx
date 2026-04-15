"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  eachDayOfInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status-styles";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type CalTask = {
  id: string;
  title: string;
  status: TaskStatus;
  deadline: string | null;
  startTime: string | null;
};

function taskOnDay(t: CalTask, day: Date) {
  const d = t.deadline ? new Date(t.deadline) : t.startTime ? new Date(t.startTime) : null;
  if (!d) return false;
  return isSameDay(d, day);
}

export function CalendarView({
  tasks,
  onOpenTask,
}: {
  tasks: CalTask[];
  onOpenTask: (id: string) => void;
}) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [tab, setTab] = useState<"week" | "month">("week");

  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start, end });

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthGrid = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  return (
    <div className="rounded-lg border border-border bg-card/20 p-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "week" | "month")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="week" className="text-xs">
              周视图
            </TabsTrigger>
            <TabsTrigger value="month" className="text-xs">
              月视图
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAnchor(tab === "week" ? addDays(anchor, -7) : addMonths(anchor, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[180px] text-center text-xs text-muted-foreground">
              {tab === "week"
                ? `${format(start, "yyyy-MM-dd")} ~ ${format(end, "yyyy-MM-dd")}`
                : format(anchor, "yyyy 年 M 月")}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAnchor(tab === "week" ? addDays(anchor, 7) : addMonths(anchor, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="week" className="mt-0">
          <p className="mb-2 text-xs text-muted-foreground">个人任务排期（按截止日/开始日落在当天）</p>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="min-h-[200px] rounded-md border border-border/80 bg-background/40 p-2"
              >
                <div className="mb-2 text-center text-[10px] font-medium text-muted-foreground">
                  {format(day, "EEE")}
                  <div className="text-foreground">{format(day, "d")}</div>
                </div>
                <div className="space-y-1">
                  {tasks
                    .filter((t) => taskOnDay(t, day))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTask(t.id)}
                        className="w-full rounded border border-border/60 bg-muted/30 px-1 py-1 text-left text-[10px] leading-tight hover:border-primary/40"
                      >
                        <div className="line-clamp-2">{t.title}</div>
                        <Badge variant={statusBadgeVariant(t.status)} className="mt-0.5 text-[9px]">
                          {t.status}
                        </Badge>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="month" className="mt-0">
          <p className="mb-2 text-xs text-muted-foreground">月视图 · 显示截止/开始落在当日的任务</p>
          <div className="grid grid-cols-7 gap-px rounded-md border border-border bg-border text-[10px]">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <div key={d} className="bg-muted/50 py-1 text-center text-muted-foreground">
                {d}
              </div>
            ))}
            {monthGrid.map((day) => {
              const inMonth = isSameMonth(day, anchor);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] bg-background/80 p-1 ${!inMonth ? "opacity-40" : ""}`}
                >
                  <div className="text-right text-muted-foreground">{format(day, "d")}</div>
                  <div className="space-y-0.5">
                    {tasks
                      .filter((t) => taskOnDay(t, day))
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onOpenTask(t.id)}
                          className="w-full truncate rounded bg-muted/40 px-0.5 text-left text-[9px] hover:bg-muted"
                          title={t.title}
                        >
                          {t.title.slice(0, 8)}
                          {t.title.length > 8 ? "…" : ""}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
