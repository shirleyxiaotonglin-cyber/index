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

/**
 * 默认优先 openrouter/free（自动换可用免费路由，减少单模型如 70b 在 Venice 上被限流）。
 * 需要固定高质量时再设 OPENROUTER_MEETING_MODEL。
 */
const DEFAULT_MEETING_MODEL = "openrouter/free";

/**
 * 自动备用：不含 llama-3.3-70b-instruct:free（常在 Venice 上 429）。
 * 需要 70b 时在 Vercel 设置 OPENROUTER_MEETING_MODEL=meta-llama/llama-3.3-70b-instruct:free。
 */
const MEETING_FALLBACK_MODELS = ["meta-llama/llama-3.2-3b-instruct:free"] as const;

const RATE_LIMIT_RETRY_MS = 2800;

/** OpenRouter 已下线、仍可能留在 .env / Vercel 里的 :free 模型 ID，自动改用默认 */
const RETIRED_OPENROUTER_FREE_MODELS = new Set(["meta-llama/llama-3.1-8b-instruct:free"]);

/**
 * 仅读 OPENROUTER_MEETING_MODEL（不与 OPENROUTER_MODEL 混用，避免 Vercel 里全局填了 70b 导致会议纪要也撞 Venice）。
 * 若需与站内其它 AI 同模型，请在 Vercel 里同时设置 OPENROUTER_MEETING_MODEL。
 */
function resolveMeetingModelId(): string {
  const raw = (process.env.OPENROUTER_MEETING_MODEL || "").trim();
  if (!raw) return DEFAULT_MEETING_MODEL;
  if (raw === "api/v1" || raw === "v1" || raw.startsWith("http://") || raw.startsWith("https://")) {
    return DEFAULT_MEETING_MODEL;
  }
  if (RETIRED_OPENROUTER_FREE_MODELS.has(raw)) return DEFAULT_MEETING_MODEL;
  return raw;
}

function uniqModelOrder(primary: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  /** 用户若只填 70b，Venice 上常先 429；仍优先试 openrouter/free 再试其指定模型 */
  const preferRouterFirst = primary === "meta-llama/llama-3.3-70b-instruct:free";
  const seq = preferRouterFirst
    ? ["openrouter/free", primary, ...MEETING_FALLBACK_MODELS]
    : [primary, ...MEETING_FALLBACK_MODELS];
  for (const m of seq) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ChatJson =
  | { kind: "message"; content: string }
  | { kind: "rate_limited" }
  | { kind: "empty_or_error"; detail: string };

function isRateLimitedOpenRouterError(
  raw: string,
  err: { code?: number; message?: string; metadata?: { raw?: string } } | undefined,
): boolean {
  if (!err) return false;
  if (err.code === 429) return true;
  const meta = typeof err.metadata?.raw === "string" ? err.metadata.raw : "";
  const blob = `${raw} ${err.message || ""} ${meta}`;
  return (
    /rate-?limit|temporarily rate-limited|"code"\s*:\s*429/i.test(blob) ||
    (err.message === "Provider returned error" && /429|rate-?limit|temporarily/i.test(blob))
  );
}

/** 解析 OpenRouter chat 响应：成功正文 / 限流 / 其它错误 */
function parseChatCompletionJson(raw: string): ChatJson {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { kind: "empty_or_error", detail: raw.slice(0, 400) };
  }
  const d = data as {
    error?: { code?: number; message?: string; metadata?: { raw?: string } };
    choices?: { message?: { content?: string } }[];
  };
  const err = d.error;
  const hasChoices = Array.isArray(d.choices) && d.choices.length > 0;
  if (err && !hasChoices) {
    if (isRateLimitedOpenRouterError(raw, err)) {
      return { kind: "rate_limited" };
    }
    return { kind: "empty_or_error", detail: raw.slice(0, 400) };
  }
  const content = d.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return { kind: "message", content };
  }
  return { kind: "empty_or_error", detail: raw.slice(0, 400) };
}

function isHttpRateLimited(status: number, raw: string): boolean {
  if (status === 429) return true;
  return /"code"\s*:\s*429|rate-?limit|temporarily rate-limited/i.test(raw);
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
  const models = uniqModelOrder(resolveMeetingModelId());
  let lastDetail = "";

  const messages = [
    { role: "system" as const, content: SYSTEM },
    {
      role: "user" as const,
      content: `请从以下正文提取任务与项目信息：\n\n${text.slice(0, 120000)}`,
    },
  ];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = {
        model,
        temperature: 0.2,
        response_format: { type: "json_object" as const },
        messages,
      };

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: openRouterRequestHeaders(key.trim()),
        body: JSON.stringify(body),
      });

      const raw = await res.text();

      if (res.status === 401) {
        return { ok: false, error: "OpenRouter 请求失败", detail: raw.slice(0, 400) };
      }

      if (!res.ok) {
        lastDetail = raw.slice(0, 400);
        if (isHttpRateLimited(res.status, raw) && attempt === 0) {
          await sleep(RATE_LIMIT_RETRY_MS);
          continue;
        }
        if (isHttpRateLimited(res.status, raw)) break;
        break;
      }

      const parsed = parseChatCompletionJson(raw);
      if (parsed.kind === "message") {
        let out: unknown;
        try {
          out = JSON.parse(parsed.content);
        } catch {
          return { ok: false, error: "模型输出不是合法 JSON", detail: parsed.content.slice(0, 240) };
        }
        return { ok: true, parsed: out };
      }

      if (parsed.kind === "rate_limited") {
        lastDetail = raw.slice(0, 400);
        if (attempt === 0) {
          await sleep(RATE_LIMIT_RETRY_MS);
          continue;
        }
        break;
      }

      lastDetail = parsed.detail;
      break;
    }
  }

  return {
    ok: false,
    error: "OpenRouter 请求失败（免费模型可能短时限流，请稍后重试；或在 OpenRouter 绑定自有提供商密钥以提升额度）",
    detail: lastDetail.slice(0, 400),
  };
}
