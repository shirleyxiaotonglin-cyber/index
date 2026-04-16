/**
 * 在配置了 OPENAI_API_KEY 时用 gpt-4o-mini 生成分析；否则应使用 ai-mock 的同名函数结果。
 */
import type { Project, Task } from "@prisma/client";
import { openaiChatJson, hasOpenAiKey } from "@/lib/openai";
import * as mock from "@/lib/ai-mock";

type TaskLite = Pick<Task, "title" | "status" | "priority" | "deadline" | "startTime">;

function truncateJson(obj: unknown, maxLen = 28000): string {
  const s = JSON.stringify(obj);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…(truncated)";
}

async function tryJson<T>(prompt: string, fallback: T): Promise<T> {
  if (!hasOpenAiKey()) return fallback;
  try {
    const text = await openaiChatJson(prompt);
    return JSON.parse(text) as T;
  } catch (e) {
    console.error("[ai-llm] OpenAI failed, using mock:", e);
    return fallback;
  }
}

export async function llmTaskSummary(
  task: TaskLite & { title: string; description?: string | null },
): Promise<ReturnType<typeof mock.buildTaskSummary>> {
  const fallback = mock.buildTaskSummary(task);
  const prompt = `根据以下任务信息，输出任务分析 JSON，结构与示例完全一致（字段名相同）：\n示例：${truncateJson(fallback)}\n\n任务数据：${truncateJson(task)}`;
  return tryJson(prompt, fallback);
}

export async function llmDecompose(title: string): Promise<ReturnType<typeof mock.buildDecomposeSuggestion>> {
  const fallback = mock.buildDecomposeSuggestion(title);
  const prompt = `父任务标题：${JSON.stringify(title)}\n请输出「任务拆解建议」JSON，结构与示例一致：\n示例：${truncateJson(fallback)}`;
  return tryJson(prompt, fallback);
}

export async function llmDailyReport(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
): Promise<ReturnType<typeof mock.buildDailyReport>> {
  const fallback = mock.buildDailyReport(project, tasks);
  const prompt = `根据项目与任务列表生成「每日进度」JSON，结构与示例一致：\n示例：${truncateJson(fallback)}\n\n项目：${truncateJson(project)}\n任务列表：${truncateJson(tasks)}`;
  return tryJson(prompt, fallback);
}

export async function llmWeeklyReport(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
): Promise<ReturnType<typeof mock.buildWeeklyReport>> {
  const fallback = mock.buildWeeklyReport(project, tasks);
  const prompt = `根据项目与任务列表生成「周报」JSON，结构与示例一致（含 weekNote、loadHint 等字段）：\n示例：${truncateJson(fallback)}\n\n项目：${truncateJson(project)}\n任务：${truncateJson(tasks)}`;
  return tryJson(prompt, fallback);
}

export async function llmProjectSummary(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
  completionRate: number,
  riskObj: ReturnType<typeof mock.buildRiskAnalysis>,
): Promise<{
  title: string;
  completion: number;
  risk: ReturnType<typeof mock.buildRiskAnalysis>;
  narrative: string;
}> {
  const fallback = {
    title: `${project.name} — 项目总结`,
    completion: completionRate,
    risk: riskObj,
    narrative: `共 ${tasks.length} 项任务，完成率 ${completionRate}%。`,
  };
  const prompt = `根据项目与任务生成「项目总结」JSON，字段：title, completion(数字), risk(与示例同结构), narrative(简短中文段落)。\n示例 risk 结构：${truncateJson(riskObj)}\n\n项目：${truncateJson(project)}\n任务数：${tasks.length}，完成率约 ${completionRate}%`;
  return tryJson(prompt, fallback);
}

export async function llmProjectDeep(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
): Promise<ReturnType<typeof mock.buildProjectDeepSummary>> {
  const fallback = mock.buildProjectDeepSummary(project, tasks);
  const prompt = `输出「项目深度总结」JSON，结构与示例一致（含 overallProgress、bottleneckAnalysis、teamEfficiencyNote、narrative 等）：\n示例：${truncateJson(fallback)}\n\n项目：${truncateJson(project)}\n任务：${truncateJson(tasks)}`;
  return tryJson(prompt, fallback);
}

export async function llmRisk(tasks: TaskLite[]): Promise<ReturnType<typeof mock.buildRiskAnalysis>> {
  const fallback = mock.buildRiskAnalysis(tasks);
  const prompt = `输出「风险分析」JSON，结构与示例一致：\n示例：${truncateJson(fallback)}\n\n任务：${truncateJson(tasks)}`;
  return tryJson(prompt, fallback);
}

export async function llmRiskPredict(tasks: TaskLite[]): Promise<ReturnType<typeof mock.buildRiskPredict>> {
  const fallback = mock.buildRiskPredict(tasks);
  const prompt = `输出「风险预测」JSON，结构与示例一致（delayPredictions、highRisk）：\n示例：${truncateJson(fallback)}\n\n任务：${truncateJson(tasks)}`;
  return tryJson(prompt, fallback);
}

/** 保持与路由中 workload 分支相同的 result 结构 */
export async function llmWorkloadResult<T extends Record<string, unknown>>(result: T): Promise<T> {
  const prompt = `根据以下工作负载分布 JSON，输出**同结构**的 JSON；可优化 suggestion 为一句中文建议，distribution/overload 数组结构与数值保持一致。\n数据：${truncateJson(result)}`;
  return tryJson(prompt, result);
}
