/**
 * 静态 workgraph / index.html 的 AI 中心：基于任务快照调用 OpenRouter 生成文本。
 * 失败时由前端回退到本地规则。
 */
import { callUnifiedAi, hasOpenRouterKey } from "@/lib/openai";

export type WorkgraphKind = "daily" | "dayplan" | "weekplan" | "risk" | "weekreport" | "decompose";

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
    daily: `${common} 生成「日报」：汇总今日重点事项与执行状态；基于任务状态统计（完成/进行中/阻塞/待办等），并给出 1～3 条简短建议。`,
    dayplan: `${common} 生成「今日计划」：只关注未完成任务中，开始日或截止日为「今天」的任务；按优先级（P0 优先）与 deadline 排序；若无则说明并给轻量建议。`,
    weekplan: `${common} 生成「本周计划」：自然周为「本周一～本周日」；按未完成任务中有 deadline 的日期分组列出；若某天无任务可省略该天。`,
    risk: `${common} 生成「风险摘要」：识别延期（deadline 早于今日且未完成）、阻塞、未完成 P0 等；每条尽量带任务标题。`,
    weekreport: `${common} 生成「周度工作报告」：结构参考——一、总体概况；二、项目进展（按项目）；三、完成工作；四、风险与延期；五、本周关键节点；六、下周关注点。数据须与下方 JSON 一致，勿编造任务。`,
    decompose: `${common} 生成「任务拆解」：为给定父任务标题输出 4～8 条可执行子任务（含序号），可含角色/优先级建议。`,
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
  return `请根据以下 JSON 中的任务与项目数据完成「${input.kind}」输出。\n\n${JSON.stringify(compact)}`;
}

export async function runWorkgraphInsightWithOpenRouter(
  input: WorkgraphInsightInput,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!hasOpenRouterKey()) {
    return { ok: false, error: "未配置 OPENROUTER_API_KEY" };
  }
  const valid: WorkgraphKind[] = ["daily", "dayplan", "weekplan", "risk", "weekreport", "decompose"];
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
