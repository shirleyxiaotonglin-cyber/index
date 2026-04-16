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
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const role = await getProjectRole(user.id, task.projectId);
    const where = taskVisibilityWhere(task.projectId, user.id, user.globalRole, role);
    const ok = await prisma.task.findFirst({ where: { AND: [{ id: taskId }, where] } });
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const result = await llmTaskSummary(task);
    return NextResponse.json({ result });
  }

  if (kind === "decompose") {
    const t = (title || "").trim();
    if (!t) return NextResponse.json({ error: "title required" }, { status: 400 });
    const result = await llmDecompose(t);
    return NextResponse.json({ result });
  }

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const role = await getProjectRole(user.id, projectId);
  if (user.globalRole !== "ADMIN" && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = taskVisibilityWhere(projectId, user.id, user.globalRole, role);
  const tasks = await prisma.task.findMany({ where });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (kind === "daily") {
    const result = await llmDailyReport(project, tasks);
    return NextResponse.json({ result });
  }
  if (kind === "weekly") {
    const result = await llmWeeklyReport(project, tasks);
    return NextResponse.json({ result });
  }
  if (kind === "project") {
    const done = tasks.filter((t) => t.status === "done").length;
    const rate = tasks.length ? Math.round((done / tasks.length) * 1000) / 10 : 0;
    const risk = buildRiskAnalysis(tasks);
    const result = await llmProjectSummary(project, tasks, rate, risk);
    return NextResponse.json({ result });
  }
  if (kind === "project_deep") {
    const result = await llmProjectDeep(project, tasks);
    return NextResponse.json({ result });
  }
  if (kind === "risk") {
    const result = await llmRisk(tasks);
    return NextResponse.json({ result });
  }
  if (kind === "risk_predict") {
    const result = await llmRiskPredict(tasks);
    return NextResponse.json({ result });
  }
  if (kind === "workload") {
    const byAssignee = await prisma.task.groupBy({
      by: ["assigneeId"],
      where: { ...where, assigneeId: { not: null }, status: { not: "done" } },
      _count: { _all: true },
    });
    const sorted = [...byAssignee].sort((a, b) => b._count._all - a._count._all);
    const overload = sorted.filter((x) => x._count._all >= 5);
    const baseResult = {
      distribution: sorted.map((s) => ({ assigneeId: s.assigneeId, open: s._count._all })),
      overload,
      suggestion:
        overload.length > 0
          ? "部分成员待办较多，建议平衡或拆分任务。"
          : "负载相对均衡。",
    };
    const result = await llmWorkloadResult(baseResult);
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: "Unknown" }, { status: 400 });
}
