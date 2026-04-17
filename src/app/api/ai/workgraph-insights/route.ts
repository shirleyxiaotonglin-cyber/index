import { NextResponse } from "next/server";
import {
  runWorkgraphInsightWithOpenRouter,
  type WorkgraphInsightInput,
  type WorkgraphKind,
} from "@/lib/workgraph-openrouter";

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
 * 静态 workgraph / index.html 的 AI 中心：OpenRouter 生成日报/计划/风险/周报/拆解。
 * POST body 与 WorkgraphInsightInput 一致；失败时由前端回退本地规则。
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
  const o = json as Record<string, unknown>;
  const kind = o.kind as WorkgraphKind | undefined;
  const kinds: WorkgraphKind[] = [
    "daily",
    "dayplan",
    "weekplan",
    "risk",
    "weekreport",
    "decompose",
    "enterprise_pulse",
    "schedule_daily",
    "schedule_weekly",
    "schedule_todo",
  ];
  if (!kind || !kinds.includes(kind)) {
    return withCors(NextResponse.json({ ok: false, error: "kind 无效" }, { status: 400 }));
  }
  const input: WorkgraphInsightInput = {
    kind,
    today: String(o.today || "").slice(0, 16),
    weekStart: String(o.weekStart || "").slice(0, 16),
    weekEnd: String(o.weekEnd || "").slice(0, 16),
    viewWeekStart: typeof o.viewWeekStart === "string" ? o.viewWeekStart.slice(0, 16) : undefined,
    viewWeekEnd: typeof o.viewWeekEnd === "string" ? o.viewWeekEnd.slice(0, 16) : undefined,
    nextWeekStart: typeof o.nextWeekStart === "string" ? o.nextWeekStart.slice(0, 16) : undefined,
    nextWeekEnd: typeof o.nextWeekEnd === "string" ? o.nextWeekEnd.slice(0, 16) : undefined,
    userName: typeof o.userName === "string" ? o.userName : undefined,
    projects: Array.isArray(o.projects) ? (o.projects as WorkgraphInsightInput["projects"]) : [],
    tasks: Array.isArray(o.tasks) ? (o.tasks as WorkgraphInsightInput["tasks"]) : [],
    title: typeof o.title === "string" ? o.title : undefined,
  };
  if (!input.today) {
    return withCors(NextResponse.json({ ok: false, error: "today 必填" }, { status: 400 }));
  }

  const out = await runWorkgraphInsightWithOpenRouter(input);
  if (!out.ok) {
    const status = /未配置 OPENROUTER|OPENROUTER_API_KEY/.test(out.error) ? 503 : 502;
    return withCors(NextResponse.json({ ok: false, error: out.error }, { status }));
  }
  return withCors(NextResponse.json({ ok: true, text: out.text, source: "openrouter" }));
}
