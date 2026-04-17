import type { Task, Project } from "@prisma/client";

type TaskLite = Pick<
  Task,
  "title" | "status" | "priority" | "deadline" | "startTime"
>;

export function buildDailyReport(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
) {
  const done = tasks.filter((t) => t.status === "done");
  const blocked = tasks.filter((t) => t.status === "blocked");
  const overdue = tasks.filter(
    (t) => t.deadline && t.deadline < new Date() && t.status !== "done",
  );
  return {
    title: `${project.name} — 每日进度`,
    summary: `完成 ${done.length} 项，阻塞 ${blocked.length} 项，延期 ${overdue.length} 项。`,
    sections: [
      { heading: "已完成", items: done.slice(0, 10).map((t) => t.title) },
      { heading: "阻塞", items: blocked.map((t) => t.title) },
      { heading: "延期风险", items: overdue.map((t) => t.title) },
    ],
    suggestions: [
      blocked.length ? "优先解除阻塞任务，同步依赖方。" : "保持当前节奏。",
      overdue.length ? "为延期任务重新评估截止日或拆分交付。" : "",
    ].filter(Boolean),
  };
}

export function buildWeeklyReport(project: Pick<Project, "name">, tasks: TaskLite[]) {
  const daily = buildDailyReport(project, tasks);
  return {
    ...daily,
    title: `${project.name} — 周报`,
    weekNote: "汇总周期内完成、阻塞与延期趋势；建议与干系人对齐里程碑。",
    loadHint: `未完成任务 ${tasks.filter((t) => t.status !== "done").length} 项，请关注高优先级项。`,
  };
}

export function buildTaskSummary(task: TaskLite & { description?: string | null }) {
  const risk: string[] = [];
  const nextSteps: string[] = [];
  if (task.status === "blocked") {
    risk.push("任务处于阻塞状态，需协调依赖。");
    nextSteps.push("识别阻塞来源并安排同步会议。");
  }
  if (task.deadline && task.deadline < new Date() && task.status !== "done") {
    risk.push("已超过截止日期。");
    nextSteps.push("更新截止日或缩小交付范围。");
  }
  if (task.status === "doing") {
    nextSteps.push("保持每日站会同步，更新剩余工作量。");
  }
  return {
    summary: task.description?.slice(0, 280) || `${task.title} — 暂无详细描述。`,
    progress: `状态：${task.status}，优先级：${task.priority}`,
    risks: risk,
    nextSteps,
  };
}

export function buildRiskAnalysis(tasks: TaskLite[]) {
  const overdue = tasks.filter(
    (t) => t.deadline && t.deadline < new Date() && t.status !== "done",
  );
  const blocked = tasks.filter((t) => t.status === "blocked");
  const highP = tasks.filter((t) => t.priority === "P0" && t.status !== "done");
  return {
    overdueTasks: overdue.map((t) => ({ title: t.title, priority: t.priority })),
    blockedTasks: blocked.map((t) => ({ title: t.title, priority: t.priority })),
    highPriorityOpen: highP.map((t) => t.title),
    bottleneckNote:
      blocked.length > 2
        ? "多个并行阻塞点，建议集中评审依赖与资源。"
        : "阻塞在可控范围内。",
    criticalPathRisk:
      overdue.length && blocked.length
        ? "延期与阻塞叠加，关键路径风险升高。"
        : "关键路径风险可控。",
  };
}

export function buildProjectDeepSummary(
  project: Pick<Project, "name">,
  tasks: TaskLite[],
) {
  const rate = tasks.length
    ? Math.round(
        (tasks.filter((t) => t.status === "done").length / tasks.length) * 1000,
      ) / 10
    : 0;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  return {
    title: `${project.name} — AI 项目总结`,
    overallProgress: rate,
    risk: buildRiskAnalysis(tasks),
    bottleneckAnalysis:
      blocked > 0
        ? `当前 ${blocked} 个阻塞项可能拖慢集成与验收节奏。`
        : "暂无显著瓶颈。",
    teamEfficiencyNote:
      rate > 70
        ? "交付节奏良好，可适度承接新需求。"
        : "完成率偏低，建议复盘估时与依赖。",
    narrative: `共 ${tasks.length} 项任务，完成率约 ${rate}%。`,
  };
}

export function buildDecomposeSuggestion(title: string) {
  return {
    parentTitle: title,
    subtasks: [
      { title: `${title} — 需求澄清与验收标准`, suggestedAssigneeRole: "产品经理", priority: "P1" },
      { title: `${title} — 技术方案与排期`, suggestedAssigneeRole: "Tech Lead", priority: "P1" },
      { title: `${title} — 开发与自测`, suggestedAssigneeRole: "开发", priority: "P2" },
      { title: `${title} — 联调与上线检查`, suggestedAssigneeRole: "开发/运维", priority: "P2" },
    ],
    note: "以上为规则生成的拆解模板，可在任务创建时逐条添加为子任务。",
  };
}

export function buildStandup(project: Pick<Project, "name">, tasks: TaskLite[]) {
  const doing = tasks.filter((t) => t.status === "doing").map((t) => t.title);
  const blocked = tasks.filter((t) => t.status === "blocked").map((t) => t.title);
  const todo = tasks.filter((t) => t.status === "todo").map((t) => t.title);
  return {
    type: "standup" as const,
    todayFocus: doing.slice(0, 8).length ? doing.slice(0, 8) : todo.slice(0, 8),
    yesterdayDone: tasks.filter((t) => t.status === "done").map((t) => t.title).slice(0, 8),
    blockers: blocked.slice(0, 8),
    needsHelp: blocked.slice(0, 5).map((t) => `需协调解除：${t}`),
    summary: `${project.name}：进行中 ${doing.length + todo.length} 项，阻塞 ${blocked.length} 项。`,
  };
}

export function buildExecutiveBrief(project: Pick<Project, "name">, tasks: TaskLite[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const open = tasks.length - done;
  const health =
    blocked > 2 ? ("red" as const) : blocked > 0 || open > 15 ? ("yellow" as const) : ("green" as const);
  return {
    type: "executive_brief" as const,
    headline: `${project.name}：${open} 项未关闭，已完成 ${done} 项`,
    health,
    bullets: [
      `总任务 ${tasks.length}，未关闭 ${open}`,
      blocked ? `阻塞 ${blocked} 项需决策或资源` : "当前无阻塞项",
    ],
    risks: blocked > 0 ? [`阻塞集中于 ${blocked} 项，可能影响里程碑`] : [],
    asks: blocked > 2 ? ["请协调关键依赖与责任人"] : [],
    narrative: `面向管理层的简要状态：${project.name} 交付节奏${health === "green" ? "稳定" : "需关注"}。`,
  };
}

export function buildRiskPredict(tasks: TaskLite[]) {
  const soon = new Date(Date.now() + 3 * 86400000);
  const likelyDelay = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.deadline &&
      t.deadline <= soon &&
      t.deadline >= new Date() &&
      (t.status === "blocked" || t.status === "todo"),
  );
  return {
    delayPredictions: likelyDelay.map((t) => ({
      title: t.title,
      reason: t.status === "blocked" ? "当前阻塞，易影响截止达成" : "启动偏晚，存在赶期风险",
    })),
    highRisk: tasks.filter((t) => t.priority === "P0" && t.status !== "done").map((t) => t.title),
  };
}
