/**
 * OpenRouter 统一调用层：所有 AI 功能都走这里。
 */
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
/** 与 meeting-parse 默认对齐；可用 openrouter/free 自动选免费模型（行为略随机） */
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const RETIRED_OPENROUTER_FREE_MODELS = new Set(["meta-llama/llama-3.1-8b-instruct:free"]);

function resolveModel(): string {
  const raw = (process.env.OPENROUTER_MODEL || "").trim();
  if (!raw || raw === "api/v1" || raw === "v1" || raw.startsWith("http://") || raw.startsWith("https://")) {
    return DEFAULT_MODEL;
  }
  if (RETIRED_OPENROUTER_FREE_MODELS.has(raw)) return DEFAULT_MODEL;
  return raw;
}

function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置 OPENROUTER_API_KEY");
  }
  return key;
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim() || process.env.VERCEL_URL?.trim();
  if (referer) {
    h["HTTP-Referer"] = referer.startsWith("http") ? referer : `https://${referer}`;
  }
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (title) h["X-Title"] = title.slice(0, 120);
  return h;
}

export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY?.trim();
}

type ChatMessage = { role: "system" | "user"; content: string };

export async function callUnifiedAi(messages: ChatMessage[], responseAsJson = false): Promise<string> {
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: openRouterHeaders(requireOpenRouterKey()),
    body: JSON.stringify({
      model: resolveModel(),
      messages,
      temperature: 0.35,
      ...(responseAsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error((t || `OpenRouter HTTP ${res.status}`).slice(0, 800));
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content;
  if (typeof out !== "string") {
    throw new Error("Invalid OpenRouter response");
  }
  return out;
}

export async function chatJsonWithSystem(system: string, user: string): Promise<unknown> {
  const text = await callUnifiedAi(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    true,
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }
}
