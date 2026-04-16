/**
 * OpenRouter 统一调用层：所有 AI 功能都走这里。
 */
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

function resolveModel(): string {
  return (process.env.OPENROUTER_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function requireOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("未配置 OPENROUTER_API_KEY");
  return key;
}

export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY?.trim();
}

type ChatMessage = { role: "system" | "user"; content: string };

export async function callUnifiedAi(messages: ChatMessage[], responseAsJson = false): Promise<string> {
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireOpenRouterKey()}`,
    },
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
  if (typeof out !== "string") throw new Error("Invalid OpenRouter response");
  return out;
}

export async function chatJsonWithSystem(system: string, user: string): Promise<unknown> {
  const text = await callUnifiedAi(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    true
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }
}
