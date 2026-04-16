/**
 * OpenAI Chat Completions（gpt-4o-mini），用于任务/项目 AI 分析。
 * 未设置 OPENAI_API_KEY 时由调用方回退到规则引擎（ai-mock）。
 */

export async function openaiChatJson(userContent: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "你是企业任务与项目管理助手。严格只输出一个 JSON 对象，符合用户给出的结构要求；不要 Markdown 代码块，不要任何 JSON 以外的文字。使用中文。",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content;
  if (typeof out !== "string") {
    throw new Error("Invalid OpenAI response");
  }
  return out;
}

export function hasOpenAiKey(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

/** 纯文本补全（如 POST /api/ai 仅传 prompt） */
export async function openaiChatCompletionText(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `OpenAI HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content;
  if (typeof out !== "string") {
    throw new Error("Invalid OpenAI response");
  }
  return out;
}
