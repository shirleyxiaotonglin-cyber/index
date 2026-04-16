/**
 * 会议纪要 → 结构化 JSON（供单页 index.html 的 normalizeAiMeetingParsed 使用）
 */

export type MeetingParseResult =
  | { ok: true; parsed: unknown }
  | { ok: false; error: string; detail?: string };

const SYSTEM = `你是项目任务提取助手。用户粘贴的是中文会议纪要、排期或待办列表。
请输出**唯一一个** JSON 对象（不要 markdown、不要代码围栏），字段如下：
- projectName: string|null  文中明确的新项目名，没有则 null
- renameProject: string|null  若文中有「改名：xxx」之类，填新名，否则 null
- chainHint: boolean  正文是否体现串联/流水线/依次衔接
- pipelineStages: string[]|null  若文中有阶段/流程列，按顺序列出；没有则 null
- tasks: 数组，每项含：
  - title: string（必填）
  - description: string
  - assignee: string
  - collaborators: string
  - deadline: string，尽量 YYYY-MM-DD，无法识别则 ""
  - priority: "P0"|"P1"|"P2"|"P3"
  - status: "todo"|"doing"|"blocked"|"review"|"done"
  - tags: string
  - pipelineStage: number，阶段下标 0 起；无法对应则 0

任务不要超过 80 条；截断时保留靠前、信息更完整的条目。`;

export async function parseMeetingWithAi(text: string): Promise<MeetingParseResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key?.trim()) {
    return { ok: false, error: "服务器未配置 OPENROUTER_API_KEY" };
  }
  const base = "https://openrouter.ai/api/v1";
  const model =
    process.env.OPENROUTER_MEETING_MODEL ||
    process.env.OPENROUTER_MODEL ||
    "meta-llama/llama-3.1-8b-instruct:free";
  const body = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: SYSTEM },
      {
        role: "user" as const,
        content: `请从以下正文提取任务与项目信息：\n\n${text.slice(0, 120000)}`,
      },
    ],
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: "模型请求失败",
      detail: raw.slice(0, 400),
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "接口返回非 JSON", detail: raw.slice(0, 200) };
  }

  const content = (data as { choices?: { message?: { content
