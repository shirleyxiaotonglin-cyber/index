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
  /** 将 AI 中心同款快照一次性交给模型：效率、风险、协作与节奏（面向员工提效） */
  | "enterprise_pulse"
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
  /** 下一自然周周一、周日（用于「六、下周关注点」） */
  nextWeekStart?: string;
  nextWeekEnd?: string;
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
    weekreport: `${common} 你是周度汇报撰写助手。必须严格按用户消息中的「周度工作报告」版式输出，与 JSON 数据一致；不得编造任务标题。`,
    decompose: `${common} 生成「任务拆解」：为给定父任务标题输出 4～8 条可执行子任务（含序号），可含角色/优先级建议。`,
    schedule_daily: `${common} 生成「今日工作/日度计划」：基于未完成任务。依次覆盖：①已延期项（优先）；②今日焦点（开始或截止为今日）；③未来 7 日内截止；④无截止日期但进行中/阻塞/评审。最后给简短节奏建议。数据须与 JSON 一致。`,
    schedule_weekly: `${common} 生成「本周工作计划表」：按「视图周」周一至周日（见 meta.viewWeekStart～viewWeekEnd）列出每日有开始或截止落点的任务；若某日无落点可写「当日无开始/截止落点」。与周历视图一致。勿编造任务。`,
    schedule_todo: `${common} 生成「待办清单」：排序规则为延期优先 → 截止日升序 → 优先级；每条一行，含标题、优先级、截止、状态。`,
    enterprise_pulse: `${common} 你是面向企业员工的工作效率顾问。用户消息含「AI 中心」完整任务与项目快照。请输出纯文本（不要用 Markdown 代码围栏），帮助员工看清负荷、优先级与协作风险，并给出可立即执行的效率建议。勿编造数据中不存在的任务标题。`,
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
      nextWeekStart: input.nextWeekStart || "",
      nextWeekEnd: input.nextWeekEnd || "",
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
  if (input.kind === "weekreport") {
    const ws = input.weekStart;
    const we = input.weekEnd;
    const nw0 = input.nextWeekStart || "";
    const nw1 = input.nextWeekEnd || "";
    return (
      `请输出一份「周度工作报告」纯文本（不要用 Markdown 代码围栏），可直接粘贴到邮件或 Word。\n\n` +
      `【必须遵守的版式】\n` +
      `第1行：【周度工作报告】（AI 生成）\n` +
      `第2行：汇报周期：${ws}（周一）～ ${we}（周日）\n` +
      `第3行：生成基准日：${input.today} · 账号：${input.userName || "—"}\n` +
      `空一行\n` +
      `一、总体概况\n` +
      `- 活跃项目：仅统计 JSON.projects 中 archived=false 的项目数\n` +
      `- 任务合计：全部任务按状态统计（已完成/进行中/阻塞/待办/评审）\n` +
      `- 整体任务完成率：已完成/总数 的百分比估算\n` +
      `二、项目进展（按项目）\n` +
      `对每个未归档项目用「■ 项目名」起头；按 projectId 汇总该项目任务数、各状态数、项目内完成率；若有 P0/P1 且进行中可列「重点推进」；有阻塞则列阻塞任务标题（勿超过数据范围）\n` +
      `三、完成工作（状态为「完成」的任务汇总）\n` +
      `四、风险与延期（已延期 deadline、未完成 P0、阻塞任务条数与示例标题）\n` +
      `五、本周关键节点：deadline 在 ${ws}～${we} 之间的未完成任务（日期+标题+优先级）\n` +
      `六、下周关注点：deadline 在下一自然周 ${nw0}～${nw1} 的未完成任务（若无则写「（无或尚未排期）」）\n` +
      `最后一行：— 以上为结构化摘要，可直接粘贴到邮件或文档中微调措辞 —\n\n` +
      `数据 JSON：\n${JSON.stringify(compact)}`
    );
  }
  if (input.kind === "enterprise_pulse") {
    const ws = input.weekStart;
    const we = input.weekEnd;
    const nw0 = input.nextWeekStart || "";
    const nw1 = input.nextWeekEnd || "";
    return (
      `以下 JSON 为「AI 中心」向模型提供的完整快照（含项目、任务、自然周与下周区间）。\n` +
      `请输出一份「企业工作全景 · 提效综合」纯文本，可直接给员工使用。\n\n` +
      `【必须覆盖的章节】\n` +
      `一、快照摘要：活跃项目数、任务总数、按状态粗计、完成率感知\n` +
      `二、今日优先行动（≤3 条，可执行，引用任务标题时须来自 JSON）\n` +
      `三、本周节奏与关键节点（结合 meta.weekStart～weekEnd 与 deadline）\n` +
      `四、风险与延期：阻塞、已延期 deadline、高优先级缺口（列具体标题）\n` +
      `五、效率建议：时间盒、拆分、减少打断、对齐与沟通（面向个人）\n` +
      `六、下周关注点（结合 nextWeekStart～nextWeekEnd；若无则说明）\n` +
      `最后一行：— 以上为基于当前快照的建议，可按实际会议与优先级微调 —\n\n` +
      `汇报周期（自然周）：${ws}～${we}；下一周区间：${nw0}～${nw1}\n\n` +
      `数据 JSON：\n${JSON.stringify(compact)}`
    );
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
    "enterprise_pulse",
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
