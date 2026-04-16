import { chatJsonWithSystem } from "./openai";

function truncate(s: string, max: number) {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

const BREAKDOWN_SYSTEM = `你是任务拆解助手。根据用户给出的项目上下文与正文，拆成可执行子任务。
只输出**一个** JSON 对象，不要 Markdown、不要代码围栏。字段结构：
{
  "type": "breakdown",
  "summary": string,
  "tasks": [
    {
      "title": string,
      "description": string,
      "suggestedAssignee": string | null,
      "suggestedDeadline": string,
      "priority": "P0" | "P1" | "P2" | "P3",
      "order": number
    }
  ],
  "notes": string
}
deadline 尽量用 YYYY-MM-DD，无法推断则用空字符串。使用中文。`;

const PLAN_SYSTEM = `你是排期与计划助手。根据用户给出的材料，生成**日计划**与**周计划**建议。
只输出**一个** JSON 对象，不要 Markdown、不要代码围栏。字段结构：
{
  "type": "plan",
  "daily": [
    { "date": string, "focus": string, "items": string[] }
  ],
  "weekly": [
    { "weekLabel": string, "goals": string[], "milestones": string[] }
  ],
  "summary": string
}
date 尽量用 YYYY-MM-DD；weekLabel 可为「本周」「下周」或具体日期范围。使用中文。`;

const REPORT_SYSTEM = `你是周报撰写助手。根据用户给出的工作记录与项目信息，生成结构化周报。
只输出**一个** JSON 对象，不要 Markdown、不要代码围栏。字段结构：
{
  "type": "report",
  "title": string,
  "period": string,
  "highlights": string[],
  "completed": string[],
  "inProgress": string[],
  "risks": string[],
  "nextWeek": string[],
  "metrics": { "notes": string }
}
使用中文。`;

export async function runTypedAi(
  kind: "breakdown" | "plan" | "report",
  content: string,
  projectName: string,
  projectId: string,
): Promise<unknown> {
  const ctx = `项目 ID：${projectId}\n项目名称：${projectName}\n\n用户提供的正文与材料：\n\n${truncate(content, 100000)}`;

  if (kind === "breakdown") {
    return chatJsonWithSystem(BREAKDOWN_SYSTEM, ctx);
  }
  if (kind === "plan") {
    return chatJsonWithSystem(PLAN_SYSTEM, ctx);
  }
  return chatJsonWithSystem(REPORT_SYSTEM, ctx);
}
