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

/** OpenRouter 免费端点会调整；若 404 请改 OPENROUTER_MEETING_MODEL 或见 openrouter.ai/collections/free-models */
const DEFAULT_MEETING_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/** 模型 ID 形如 provider/model；勿把 URL 路径（如 api/v1）填进 OPENROUTER_MODEL */
function resolveMeetingModelId(): string {
  const raw = (process.env.OPENROUTER_MEETING_MODEL || process.env.OPENROUTER_MODEL || "").trim();
  if (!raw) return DEFAULT_MEETING_MODEL;
  if (raw === "api/v1" || raw === "v1" || raw.startsWith("http://") || raw.startsWith("https://")) {
    return DEFAULT_MEETING_MODEL;
  }
  return raw;
}

/**
 * OpenRouter 密钥：仅 OPENROUTER_API_KEY，或误写在 OPENAI_API_KEY 中的 sk-or-…（旧部署名）。
 * 勿把真正的 OpenAI sk-… 填进此处——本接口只请求 OpenRouter。
 */
function resolveMeetingLlmKey(): string | undefined {
  const or = process.env.OPENROUTER_API_KEY?.trim();
  if (or) return or;
  const legacy = process.env.OPENAI_API_KEY?.trim();
  if (legacy?.startsWith("sk-or-")) return legacy;
  return undefined;
}

function openRouterRequestHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || process.env.VERCEL_URL?.trim();
  if (referer) {
    h["HTTP-Referer"] = referer.startsWith("http") ? referer : `https://${referer}`;
  }
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (title) h["X-Title"] = title.slice(0, 120);
  return h;
}

export async function parseMeetingWithAi(text: string): Promise<MeetingParseResult> {
  const key = resolveMeetingLlmKey();
  if (!key) {
    return {
      ok: false,
      error: "服务器未配置 OpenRouter 密钥（请在 Vercel 设置环境变量 OPENROUTER_API_KEY）",
    };
  }
  const base = "https://openrouter.ai/api/v1";
  const model = resolveMeetingModelId();
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
    headers: openRouterRequestHeaders(key.trim()),
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: "OpenRouter 请求失败",
      detail: raw.slice(0, 400),
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "接口返回非 JSON", detail: raw.slice(0, 200) };
  }

  const content = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
    ?.content;
  if (!content || typeof content !== "string") {
    return { ok: false, error: "模型未返回内容", detail: raw.slice(0, 200) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "模型输出不是合法 JSON", detail: content.slice(0, 240) };
  }

  return { ok: true, parsed };
}
