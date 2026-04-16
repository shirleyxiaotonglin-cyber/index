import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";
import {
  buildRiskAnalysis,
  buildTaskSummary,
} from "@/lib/ai-mock";
import {
  llmTaskSummary,
  llmDecompose,
  llmDailyReport,
  llmWeeklyReport,
  llmProjectSummary,
  llmProjectDeep,
  llmRisk,
  llmRiskPredict,
  llmWorkloadResult,
} from "@/lib/ai-llm";
import { hasOpenRouterKey, chatText } from "@/lib/openai";
import { runTypedAi } from "@/lib/ai-typed-openai";
import { z } from "zod";

/** POST { type, content, projectId } → OpenRouter JSON（与 kind / prompt 体系独立） */
const typedBodySchema = z.object({
  type: z.enum(["breakdown", "plan", "report"]),
  content: z.string().min(1),
  projectId: z.string().min(1),
});

const bodySchema = z.object({
  kind: z.enum([
    "daily",
    "weekly",
    "project",
    "project_deep",
    "risk",
    "risk_predict",
    "task_summary",
    "workload",
    "decompose",
  ]),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  title: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);

  const typed = typedBodySchema.safeParse(json);
  if (typed.success) {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasOpenRouterKey()) {
      return NextResponse.json({ error: "未配置 OPENROUTER_API_KEY" }, { status: 503 });
    }
    const { type, content, projectId } = typed.data;
    const role = await getProjectRole(user.id, projectId);
    if (user.globalRole !== "ADMIN" && !role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      const result = await runTypedAi(type, content, project.name, projectId);
      return NextResponse.json({ result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // 新接口：{ prompt: string } → { result: string }（与 kind 体系互斥）
  if (
    json &&
    typeof json === "object" &&
    typeof (json as { prompt?: unknown }).prompt === "string" &&
    !("kind" in json)
  ) {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return NextResponse.json({ error: "未配置 OPENROUTER_API_KEY" }, { status: 503 });
    }
    try {
      const result = await chatText((json as { prompt: string }).prompt);
      return NextResponse.json({ result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { kind, projectId, taskId, title } = parsed.data;

  if (kind === "task_summary") {
    if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status:
