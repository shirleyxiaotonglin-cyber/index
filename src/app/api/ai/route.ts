import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, getProjectRole } from "@/lib/api-context";
import { taskVisibilityWhere } from "@/lib/task-access";
import {
  buildDailyReport,
  buildRiskAnalysis,
  buildTaskSummary,
  buildWeeklyReport,
  buildProjectDeepSummary,
  buildDecomposeSuggestion,
  buildRiskPredict,
  buildStandup,
  buildExecutiveBrief,
  buildDayplanFallback,
  buildWeekplanNaturalFallback,
  buildWeekReportFallback,
  buildEnterprisePulseFallback,
} from "@/lib/ai-mock";
import { hasOpenRouterKey } from "@/lib/openai";
import { runTypedAi } from "@/lib/ai-typed-openai";
import { runAiCenterKind } from "@/lib/ai-center-openrouter";
import { z } from "zod";

function jsonResult(result: unknown, source: "openrouter" | "rules") {
  return NextResponse.json({ result, source });
}

/** POST { type, content, projectId } → OpenRouter JSON（与 kind 体系独立） */
const typedBodySchema = z.object({
  type: z.enum(["breakdown", "plan", "report"]),
  content: z.string().min(1),
  projectId: z.string().min(1),
});

const bodySchema = z.object({
  kind: z.enum([
    "daily",
    "weekly",
    "dayplan",
    "weekplan",
    "weekreport",
    "enterprise_pulse",
    "project",
    "project_deep",
    "risk",
    "risk_predict",
    "task_summary",
    "workload",
    "decompose",
    "next_actions",
    "retro",
    "standup",
    "executive_brief",
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
      return jsonResult(result, "openrouter");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 502 });
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
    const project = await prisma.project.findUnique({ where: { id: task.projectId } });
    const projectName = project?.name ?? "项目";
    if (hasOpenRouterKey()) {
      try {
        const ai = await runAiCenterKind({
          kind: "task_summary",
          projectId: task.projectId,
          projectName,
          tasks: [task],
          task: task,
        });
        return jsonResult(ai, "openrouter");
      } catch {
        // fallback below
      }
    }
    return jsonResult(buildTaskSummary(task), "rules");
  }

  if (kind === "decompose") {
    const t = (title || "").trim();
    if (!t) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (hasOpenRouterKey()) {
      try {
        const ai = await runAiCenterKind({
          kind: "decompose",
          projectId: projectId || "N/A",
          projectName: "Decompose",
          tasks: [],
          title: t,
        });
        return jsonResult(ai, "openrouter");
      } catch {
        // fallback below
      }
    }
    return jsonResult(buildDecomposeSuggestion(t), "rules");
  }

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const role = await getProjectRole(user.id, projectId);
  if (user.globalRole !== "ADMIN" && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where = taskVisibilityWhere(projectId, user.id, user.globalRole, role);
  const tasks = await prisma.task.findMany({ where });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (hasOpenRouterKey()) {
    try {
      const ai = await runAiCenterKind({
        kind: kind as
          | "daily"
          | "weekly"
          | "dayplan"
          | "weekplan"
          | "weekreport"
          | "enterprise_pulse"
          | "project"
          | "project_deep"
          | "risk"
          | "risk_predict"
          | "workload"
          | "next_actions"
          | "retro"
          | "standup"
          | "executive_brief",
        projectId,
        projectName: project.name,
        tasks,
      });
      return jsonResult(ai, "openrouter");
    } catch {
      // fallback to rule engine
    }
  }

  if (kind === "daily") return jsonResult(buildDailyReport(project, tasks), "rules");
  if (kind === "weekly") return jsonResult(buildWeeklyReport(project, tasks), "rules");
  if (kind === "dayplan") return jsonResult(buildDayplanFallback(project, tasks), "rules");
  if (kind === "weekplan") return jsonResult(buildWeekplanNaturalFallback(project, tasks), "rules");
  if (kind === "weekreport") return jsonResult(buildWeekReportFallback(project, tasks), "rules");

  if (kind === "project") {
    const done = tasks.filter((t) => t.status === "done").length;
    const rate = tasks.length ? Math.round((done / tasks.length) * 1000) / 10 : 0;
    return jsonResult(
      {
        title: `${project.name} — 项目总结`,
        completion: rate,
        risk: buildRiskAnalysis(tasks),
        narrative: `共 ${tasks.length} 项任务，完成率 ${rate}%。`,
      },
      "rules",
    );
  }

  if (kind === "project_deep") {
    return jsonResult(buildProjectDeepSummary(project, tasks), "rules");
  }
  if (kind === "risk") return jsonResult(buildRiskAnalysis(tasks), "rules");
  if (kind === "risk_predict") return jsonResult(buildRiskPredict(tasks), "rules");
  if (kind === "next_actions") {
    const top = tasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => (a.priority > b.priority ? -1 : 1))
      .slice(0, 6)
      .map((t) => t.title);
    return jsonResult({ type: "next_actions", next24h: top.slice(0, 3), next3d: top }, "rules");
  }
  if (kind === "retro") {
    const done = tasks.filter((t) => t.status === "done").map((t) => t.title).slice(0, 5);
    const blocked = tasks.filter((t) => t.status === "blocked").map((t) => t.title).slice(0, 5);
    return jsonResult(
      {
        type: "retro",
        whatWentWell: done,
        whatToImprove: blocked,
        actionItems: blocked.map((b) => ({ item: `解决：${b}`, owner: "", deadline: "" })),
      },
      "rules",
    );
  }

  if (kind === "standup") {
    return jsonResult(buildStandup(project, tasks), "rules");
  }

  if (kind === "executive_brief") {
    return jsonResult(buildExecutiveBrief(project, tasks), "rules");
  }

  if (kind === "workload") {
    const byAssignee = await prisma.task.groupBy({
      by: ["assigneeId"],
      where: { ...where, assigneeId: { not: null }, status: { not: "done" } },
      _count: { _all: true },
    });
    const sorted = [...byAssignee].sort((a, b) => b._count._all - a._count._all);
    const overload = sorted.filter((x) => x._count._all >= 5);
    return jsonResult(
      {
        distribution: sorted.map((s) => ({ assigneeId: s.assigneeId, open: s._count._all })),
        overload,
        suggestion: overload.length > 0 ? "部分成员待办较多，建议平衡或拆分任务。" : "负载相对均衡。",
      },
      "rules",
    );
  }

  if (kind === "enterprise_pulse") {
    return jsonResult(buildEnterprisePulseFallback(project, tasks), "rules");
  }

  return NextResponse.json({ error: "Unknown" }, { status: 400 });
}
