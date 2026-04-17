/**
 * Vercel Node：静态 index.html AI 中心 → OpenRouter（与 src/app/api/ai/workgraph-insights 行为一致）
 */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

var PROMPTS = {
  daily:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。可分段落与「-」列表，简洁可执行。 生成「今日工作报告」：汇总今日重点事项与执行状态；基于任务状态统计（完成/进行中/阻塞/待办等），并给出 1～3 条可执行建议。",
  dayplan:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「今日计划」：只关注未完成任务中，开始日或截止日为「今天」的任务；按优先级（P0 优先）与 deadline 排序；若无则说明并给轻量建议。",
  weekplan:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「本周计划」：自然周为「本周一～本周日」；按未完成任务中有 deadline 的日期分组列出；若某天无任务可省略该天。",
  risk:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「项目管理风险分析」：从延期、阻塞、资源与高优先级缺口等角度分析；列出具体任务标题与缓解思路；勿编造数据中不存在的任务。",
  weekreport:
    "你是项目管理助手，输出使用中文，纯文本。你是周度汇报撰写助手。必须严格按用户消息中的「周度工作报告」版式输出，与 JSON 数据一致；不得编造任务标题。",
  decompose:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「任务拆解」：为给定父任务标题输出 4～8 条可执行子任务（含序号），可含角色/优先级建议。",
  schedule_daily:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「今日工作/日度计划」：基于未完成任务。依次覆盖：①已延期项（优先）；②今日焦点（开始或截止为今日）；③未来 7 日内截止；④无截止日期但进行中/阻塞/评审。最后给简短节奏建议。数据须与 JSON 一致。",
  schedule_weekly:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「本周工作计划表」：按「视图周」周一至周日（见 meta.viewWeekStart～viewWeekEnd）列出每日有开始或截止落点的任务；若某日无落点可写「当日无开始/截止落点」。与周历视图一致。勿编造任务。",
  schedule_todo:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「待办清单」：排序规则为延期优先 → 截止日升序 → 优先级；每条一行，含标题、优先级、截止、状态。",
};

function buildUser(kind, body) {
  var tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 400) : [];
  var compact = {
    kind: kind,
    meta: {
      today: String(body.today || ""),
      weekStart: String(body.weekStart || ""),
      weekEnd: String(body.weekEnd || ""),
      nextWeekStart: String(body.nextWeekStart || ""),
      nextWeekEnd: String(body.nextWeekEnd || ""),
      viewWeekStart: String(body.viewWeekStart || ""),
      viewWeekEnd: String(body.viewWeekEnd || ""),
      userName: String(body.userName || ""),
    },
    projects: Array.isArray(body.projects) ? body.projects : [],
    tasks: tasks.map(function (t) {
      return {
        title: t.title,
        status: t.status,
        priority: t.priority || "",
        deadline: String(t.deadline || "").slice(0, 10),
        startTime: String(t.startTime || "").slice(0, 10),
        projectId: t.projectId || "",
        description: String(t.description || "").slice(0, 400),
      };
    }),
  };
  if (kind === "decompose") {
    return "待拆解父任务标题：" + String(body.title || "").trim() + "\n\n上下文（JSON）：\n" + JSON.stringify(compact);
  }
  if (kind === "weekreport") {
    var ws = String(body.weekStart || "");
    var we = String(body.weekEnd || "");
    var nw0 = String(body.nextWeekStart || "");
    var nw1 = String(body.nextWeekEnd || "");
    var tu = String(body.today || "");
    var un = String(body.userName || "");
    return (
      "请输出一份「周度工作报告」纯文本（不要用 Markdown 代码围栏），可直接粘贴到邮件或 Word。\n\n" +
      "【必须遵守的版式】\n" +
      "第1行：【周度工作报告】（AI 生成）\n" +
      "第2行：汇报周期：" +
      ws +
      "（周一）～ " +
      we +
      "（周日）\n" +
      "第3行：生成基准日：" +
      tu +
      " · 账号：" +
      (un || "—") +
      "\n" +
      "空一行\n" +
      "一、总体概况\n" +
      "- 活跃项目：仅统计 JSON.projects 中 archived=false 的项目数\n" +
      "- 任务合计：全部任务按状态统计（已完成/进行中/阻塞/待办/评审）\n" +
      "- 整体任务完成率：已完成/总数 的百分比估算\n" +
      "二、项目进展（按项目）\n" +
      "对每个未归档项目用「■ 项目名」起头；按 projectId 汇总该项目任务数、各状态数、项目内完成率；若有 P0/P1 且进行中可列「重点推进」；有阻塞则列阻塞任务标题（勿超过数据范围）\n" +
      "三、完成工作（状态为「完成」的任务汇总）\n" +
      "四、风险与延期（已延期 deadline、未完成 P0、阻塞任务条数与示例标题）\n" +
      "五、本周关键节点：deadline 在 " +
      ws +
      "～" +
      we +
      " 之间的未完成任务（日期+标题+优先级）\n" +
      "六、下周关注点：deadline 在下一自然周 " +
      nw0 +
      "～" +
      nw1 +
      " 的未完成任务（若无则写「（无或尚未排期）」）\n" +
      "最后一行：— 以上为结构化摘要，可直接粘贴到邮件或文档中微调措辞 —\n\n" +
      "数据 JSON：\n" +
      JSON.stringify(compact)
    );
  }
  var scope =
    kind === "schedule_daily" || kind === "schedule_weekly" || kind === "schedule_todo"
      ? "（tasks 为当前日程筛选下的未完成任务快照）\n\n"
      : "";
  return scope + "请根据以下 JSON 中的任务与项目数据完成输出。\n\n" + JSON.stringify(compact);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  var body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "请求体须为 JSON" });
  }
  var kinds = [
    "daily",
    "dayplan",
    "weekplan",
    "risk",
    "weekreport",
    "decompose",
    "schedule_daily",
    "schedule_weekly",
    "schedule_todo",
  ];
  var kind = String(body.kind || "");
  if (kinds.indexOf(kind) < 0) return res.status(400).json({ ok: false, error: "kind 无效" });
  if (kind === "decompose" && !String(body.title || "").trim()) {
    return res.status(400).json({ ok: false, error: "decompose 需要 title" });
  }
  if (!String(body.today || "").trim()) return res.status(400).json({ ok: false, error: "today 必填" });

  var orKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  var leg = String(process.env.OPENAI_API_KEY || "").trim();
  var key = orKey || (leg.indexOf("sk-or-") === 0 ? leg : "");
  if (!key) {
    return res.status(503).json({ ok: false, error: "未配置 OPENROUTER_API_KEY" });
  }

  var rawModel = String(process.env.OPENROUTER_MODEL || "").trim();
  if (!rawModel || rawModel === "api/v1" || rawModel === "v1" || rawModel.indexOf("http://") === 0 || rawModel.indexOf("https://") === 0) {
    rawModel = "deepseek/deepseek-v3.2";
  }
  if (rawModel === "meta-llama/llama-3.1-8b-instruct:free") rawModel = "deepseek/deepseek-v3.2";

  var hdr = {
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
  var ref = String(process.env.OPENROUTER_HTTP_REFERER || process.env.VERCEL_URL || "").trim();
  if (ref) hdr["HTTP-Referer"] = ref.indexOf("http") === 0 ? ref : "https://" + ref;
  var xt = String(process.env.OPENROUTER_APP_TITLE || "").trim();
  if (xt) hdr["X-Title"] = xt.slice(0, 120);

  var system = PROMPTS[kind];
  if (!system) return res.status(400).json({ ok: false, error: "kind 无对应提示词" });
  var user = buildUser(kind, body);
  var r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      model: rawModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  var rawText = await r.text();
  if (!r.ok) {
    return res.status(502).json({ ok: false, error: "OpenRouter 请求失败", detail: rawText.slice(0, 400) });
  }
  var data;
  try {
    data = JSON.parse(rawText);
  } catch (e2) {
    return res.status(502).json({ ok: false, error: "无效响应", detail: rawText.slice(0, 200) });
  }
  var c0 = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof c0 !== "string" || !c0.trim()) {
    return res.status(502).json({ ok: false, error: "模型输出为空" });
  }
  return res.status(200).json({ ok: true, text: c0.trim().slice(0, 120000), source: "openrouter" });
};
