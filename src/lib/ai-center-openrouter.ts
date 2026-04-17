import { chatJsonWithSystem } from "@/lib/openai";

type Kind =
  | "daily"
  | "weekly"
  | "project"
  | "project_deep"
  | "risk"
  | "risk_predict"
  | "workload"
  | "decompose"
  | "task_summary"
  | "next_actions"
  | "retro"
  | "standup"
  | "executive_brief";

type TaskLite = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeId?: string | null;
  deadline?: Date | string | null;
  tags?: string | string[] | null;
  pipelineStage?: number | null;
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function ymd(v: Date | string | null | undefined): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

function buildTaskContext(tasks: TaskLite[]): string {
  return tasks
    .slice(0, 300)
    .map((t, i) => {
      return [
        `${i + 1}. ${t.title}`,
        `status=${t.status}`,
        `priority=${t.priority}`,
        `assignee=${t.assigneeId || ""}`,
        `deadline=${ymd(t.deadline)}`,
        `stage=${t.pipelineStage ?? ""}`,
        `tags=${Array.isArray(t.tags) ? t.tags.join(",") : t.tags || ""}`,
        `desc=${truncate(t.description || "", 240)}`,
      ].join(" | ");
    })
    .join("\n");
}

function systemFor(kind: Kind): string {
  const shared =
    "你是项目管理 AI 助手。仅输出一个 JSON 对象，不要 Markdown，不要代码围栏。内容使用中文，结论可执行。";
  const map: Record<Kind, string> = {
    daily: `${shared} 结构：{"type":"daily","items":[{"owner":string,"focus":string,"tasks":string[]}],"summary":string}`,
    weekly: `${shared} 结构：{"type":"weekly","goals":string[],"milestones":string[],"risks":string[],"summary":string}`,
    project: `${shared} 结构：{"type":"project","title":string,"completion":number,"highlights":string[],"risks":string[],"next":string[]}`,
    project_deep: `${shared} 结构：{"type":"project_deep","bottlenecks":string[],"efficiencyIssues":string[],"dependencies":string[],"actions":string[]}`,
    risk: `${shared} 结构：{"type":"risk","topRisks":[{"risk":string,"impact":"high|medium|low","owner":string,"mitigation":string}]}`,
    risk_predict: `${shared} 结构：{"type":"risk_predict","delayCandidates":[{"task":string,"probability":number,"reason":string,"suggestion":string}],"summary":string}`,
    workload: `${shared} 结构：{"type":"workload","distribution":[{"owner":string,"open":number}],"overload":string[],"rebalancing":string[]}`,
    decompose: `${shared} 结构：{"type":"decompose","summary":string,"tasks":[{"title":string,"description":string,"suggestedAssignee":string,"suggestedDeadline":string,"priority":"P0|P1|P2|P3","order":number}]}`,
    task_summary: `${shared} 结构：{"type":"task_summary","task":string,"status":string,"priority":string,"keyPoints":string[],"risks":string[],"next":string[]}`,
    next_actions: `${shared} 结构：{"type":"next_actions","next24h":string[],"next3d":string[],"ownerHints":string[]}`,
    retro: `${shared} 结构：{"type":"retro","whatWentWell":string[],"whatToImprove":string[],"actionItems":[{"item":string,"owner":string,"deadline":string}]}`,
    standup: `${shared} 结构：{"type":"standup","todayFocus":string[],"yesterdayDone":string[],"blockers":string[],"needsHelp":string[]}`,
    executive_brief: `${shared} 结构：{"type":"executive_brief","headline":string,"health":"green|yellow|red","bullets":string[],"risks":string[],"asks":string[]}`,
  };
  return map[kind];
}

export async function runAiCenterKind(params: {
  kind: Kind;
  projectId: string;
  projectName: string;
  tasks: TaskLite[];
  title?: string;
  task?: TaskLite;
}): Promise<unknown> {
  const { kind, projectId, projectName, tasks, title, task } = params;
  const baseCtx =
    `项目ID: ${projectId}\n项目名: ${projectName}\n` +
    `任务总数: ${tasks.length}\n\n` +
    `任务清单:\n${buildTaskContext(tasks)}`;
  const taskCtx = task
    ? `\n\n目标任务:\n${task.title} | status=${task.status} | priority=${task.priority} | deadline=${ymd(task.deadline)} | desc=${truncate(task.description || "", 320)}`
    : "";
  const decomposeCtx = title ? `\n\n待拆解标题: ${title}\n请按可执行顺序输出。` : "";
  return chatJsonWithSystem(systemFor(kind), `${baseCtx}${taskCtx}${decomposeCtx}`);
}

