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
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。可分段落与「-」列表，简洁可执行。 生成「日报」：汇总今日重点事项与执行状态；基于任务状态统计（完成/进行中/阻塞/待办等），并给出 1～3 条简短建议。",
  dayplan:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「今日计划」：只关注未完成任务中，开始日或截止日为「今天」的任务；按优先级（P0 优先）与 deadline 排序；若无则说明并给轻量建议。",
  weekplan:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「本周计划」：自然周为「本周一～本周日」；按未完成任务中有 deadline 的日期分组列出；若某天无任务可省略该天。",
  risk:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「风险摘要」：识别延期（deadline 早于今日且未完成）、阻塞、未完成 P0 等；每条尽量带任务标题。",
  weekreport:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「周度工作报告」：结构参考——一、总体概况；二、项目进展（按项目）；三、完成工作；四、风险与延期；五、本周关键节点；六、下周关注点。数据须与下方 JSON 一致，勿编造任务。",
  decompose:
    "你是项目管理助手，输出使用中文。使用纯文本，不要用 Markdown 代码围栏。 生成「任务拆解」：为给定父任务标题输出 4～8 条可执行子任务（含序号），可含角色/优先级建议。",
};

function buildUser(kind, body) {
  var tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 400) : [];
  var compact = {
    kind: kind,
    meta: {
      today: String(body.today || ""),
      weekStart: String(body.weekStart || ""),
      weekEnd: String(body.weekEnd || ""),
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
  return '请根据以下 JSON 中的任务与项目数据完成「' + kind + "」输出。\n\n" + JSON.stringify(compact);
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
  var kinds = ["daily", "dayplan", "weekplan", "risk", "weekreport", "decompose"];
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
