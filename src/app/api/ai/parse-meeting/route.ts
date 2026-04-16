import { NextResponse } from "next/server";
import { parseMeetingWithOpenAI } from "@/lib/meeting-parse-openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(res: NextResponse) {
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.headers.set(k, v);
  }
  return res;
}

/**
 * 单页 index.html（同域或跨域 file:// / 局域网）调用的公开 AI 解析接口；密钥仅服务端。
 * POST { text: string } → { ok, parsed } | { ok: false, error, detail? }
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return withCors(NextResponse.json({ ok: false, error: "请求体须为 JSON" }, { status: 400 }));
  }
  const text =
    typeof json === "object" && json !== null && "text" in json
      ? String((json as { text?: unknown }).text ?? "")
      : "";
  if (!text.trim()) {
    return withCors(NextResponse.json({ ok: false, error: "text 为空" }, { status: 400 }));
  }

  const out = await parseMeetingWithOpenAI(text);
  if (!out.ok) {
    const status = out.error.includes("OPENAI_API_KEY") ? 503 : 502;
    return withCors(
      NextResponse.json({ ok: false, error: out.error, detail: out.detail }, { status })
    );
  }
  return withCors(NextResponse.json({ ok: true, parsed: out.parsed }));
}
