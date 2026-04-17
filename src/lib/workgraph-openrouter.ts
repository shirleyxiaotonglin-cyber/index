/**
 * 静态 workgraph / index.html 的 AI 中心：基于任务快照调用 OpenRouter 生成文本。
 * 失败时由前端回退到本地规则。
 */
import { callUnifiedAi, hasOpenRouterKey } from "@/lib/openai";

export type WorkgraphKind =
  | "daily"
  | "dayplan"
  | "weekplan"
  | "risk"
  | "weekreport"
  | "decompose"
  /** 日程页：日度计划（含延期/今日焦点/未来7日/无DDL事项） */
  | "schedule_daily"
  /** 日程页：当前周视图内的周度计划表 */
  | "schedule_weekly"
  /** 日程页：待办清单排序 */
  | "schedule_todo";

export type WorkgraphTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  deadline?: string;
  startTime?: string;
  projectId?: string;
  description?: string;
};

export type WorkgraphProject = { id: string; name: string; archived?: boolean };

export type WorkgraphInsightInput = {
  kind: WorkgraphKind;
  today: string;
  weekStart: string;
  weekEnd: string;
  /** 日程页当前周历对应的周一、周日（可与自然周不同） */
  viewWeekStart?: string;
  viewWeekEnd?: string;
  userName?: string;
  projects: WorkgraphProject[];
  tasks: WorkgraphTask[];
  title?: string;
};

const MAX_TASKS = 400;

function systemPrompt(kind: WorkgraphKind): string {
  const common =
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。可分段落与「-」列表，简洁可执行。";
  const map: Record<WorkgraphKind, string> = {
    daily: `${common} 生成「今日工作报告」：汇总今日重点事项与执行状态；基于任务状态统计（完成/进行中/阻塞/待办等），并给出 1～3 条可执行建议。`,
    dayplan: `${common} 生成「今日计划」：只关注未完成任务中，开始日或截止日为「今天」的任务；按优先级（P0 优先）与 deadline 排序；若无则说明并给轻量建议。`,
    weekplan: `${common} 生成「本周计划」：自然周为「本周一～本周日」；按未完成任务中有 deadline 的日期分组列出；若某天无任务可省略该天。`,
    risk: `${common} 生成「项目管理风险分析」：从延期、阻塞、资源与高优先级缺口等角度分析；列出具体任务标题与缓解思路；勿编造数据中不存在的任务。`,
    weekreport: `${common} 生成「本周工作报告」：结构参考——一、总体概况；二、项目进展（按项目）；三、完成工作；四、风险与延期；五、本周关键节点；六、下周关注点。数据须与下方 JSON 一致，勿编造任务。`,
    decompose: `${common} 生成「任务拆解」：为给定父任务标题输出 4～8 条可执行子任务（含序号），可含角色/优先级建议。`,
    schedule_daily: `${common} 生成「今日工作/日度计划」：基于未完成任务。依次覆盖：①已延期项（优先）；②今日焦点（开始或截止为今日）；③未来 7 日内截止；④无截止日期但进行中/阻塞/评审。最后给简短节奏建议。数据须与 JSON 一致。`,
    schedule_weekly: `${common} 生成「本周工作计划表」：按「视图周」周一至周日（见 meta.viewWeekStart～viewWeekEnd）列出每日有开始或截止落点的任务；若某日无落点可写「当日无开始/截止落点」。与周历视图一致。勿编造任务。`,
    schedule_todo: `${common} 生成「待办清单」：排序规则为延期优先 → 截止日升序 → 优先级；每条一行，含标题、优先级、截止、状态。`,
  };
  return map[kind];
}

function buildUserContent(input: WorkgraphInsightInput): string {
  const tasks = [...input.tasks].slice(0, MAX_TASKS);
  const compact = {
    kind: input.kind,
    meta: {
      today: input.today,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      viewWeekStart: input.viewWeekStart || "",
      viewWeekEnd: input.viewWeekEnd || "",
      userName: input.userName || "",
    },
    projects: input.projects,
    tasks: tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority || "",
      deadline: (t.deadline || "").slice(0, 10),
      startTime: (t.startTime || "").slice(0, 10),
      projectId: t.projectId || "",
      description: (t.description || "").slice(0, 400),
    })),
  };
  if (input.kind === "decompose") {
    return `待拆解父任务标题：${(input.title || "").trim()}\n\n上下文（JSON）：\n${JSON.stringify(compact)}`;
  }
  const scopeNote =
    input.kind === "schedule_daily" || input.kind === "schedule_weekly" || input.kind === "schedule_todo"
      ? "（tasks 为当前日程筛选下的未完成任务快照）\n\n"
      : "";
  return `${scopeNote}请根据以下 JSON 中的任务与项目数据完成输出。\n\n${JSON.stringify(compact)}`;
}

export async function runWorkgraphInsightWithOpenRouter(
  input: WorkgraphInsightInput,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!hasOpenRouterKey()) {
    return { ok: false, error: "未配置 OPENROUTER_API_KEY" };
  }
  const valid: WorkgraphKind[] = [
    "daily",
    "dayplan",
    "weekplan",
    "risk",
    "weekreport",
    "decompose",
    "schedule_daily",
    "schedule_weekly",
    "schedule_todo",
  ];
  if (!valid.includes(input.kind)) {
    return { ok: false, error: "无效 kind" };
  }
  if (input.kind === "decompose" && !(input.title || "").trim()) {
    return { ok: false, error: "decompose 需要 title" };
  }
  const system = systemPrompt(input.kind);
  const user = buildUserContent(input);
  try {
    const text = await callUnifiedAi(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      false,
    );
    const t = String(text || "").trim();
    if (!t) return { ok: false, error: "模型输出为空" };
    return { ok: true, text: t.slice(0, 120000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
