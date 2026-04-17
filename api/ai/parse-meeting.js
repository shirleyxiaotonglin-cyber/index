/**
 * Vercel Node Serverless（纯静态 index.html 部署时使用；与 src/app/api/ai/parse-meeting 行为一致）
 * Next.js 构建会忽略此目录；仅「非 Next」或仅静态输出时生效。
 */
const SYSTEM = `你是项目任务提取助手。用户粘贴的是中文会议纪要、排期或待办列表。
请输出**唯一一个** JSON 对象（不要 markdown、不要代码围栏），字段如下：
- projectName: string|null  文中明确的新项目名，没有则 null
- renameProject: string|null  若文中有「改名：xxx」之类，填新名，否则 null
- chainHint: boolean  正文是否体现串联/流水线/依次衔接
- pipelineStages: string[]|null  若文中有阶段/流程列，按顺序列出；没有则 null
- tasks: 数组，每项含：
  - title: string（必填）
  - description: string
  - assignee: string
  - collaborators: string
  - deadline: string，尽量 YYYY-MM-DD，无法识别则 ""
  - priority: "P0"|"P1"|"P2"|"P3"
  - status: "todo"|"doing"|"blocked"|"review"|"done"
  - tags: string
  - pipelineStage: number，阶段下标 0 起；无法对应则 0

任务不要超过 80 条；截断时保留靠前、信息更完整的条目。`;
const EXTRA_RULES = `补充规则（必须遵守）：
1) 只能输出合法 JSON；字段类型稳定。
2) 优先级映射：紧急/最高/阻塞=>P0，高=>P1，中=>P2，低=>P3；不确定用 P2。
3) 截止日期尽量输出 YYYY-MM-DD；相对日期（明天/本周五/下周三）按当前时间推断，无法确定输出 ""。
4) 负责人与协作人支持“由A负责，B协作”“A（主），B/C”；不确定时保守留空，不要编造。`;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, error: "请求体须为 JSON" });
  }
  const text = String(body.text || "").trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: "text 为空" });
  }
  var orKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  var leg = String(process.env.OPENAI_API_KEY || "").trim();
  var key = orKey || (leg.indexOf("sk-or-") === 0 ? leg : "");
  if (!key) {
    return res.status(503).json({
      ok: false,
      error: "服务器未配置 OpenRouter 密钥（请在 Vercel 设置环境变量 OPENROUTER_API_KEY）",
    });
  }
  const base = "https://openrouter.ai/api/v1";
  var DEFAULT_MR_MODEL = "deepseek/deepseek-v3.2";
  var FALLBACKS = ["meta-llama/llama-3.2-3b-instruct:free"];
  var MAX_ROUNDS = 3;
  var BACKOFF = [900, 1800, 3200];
  var rawModel = String(process.env.OPENROUTER_MEETING_MODEL || "").trim();
  if (rawModel === "meta-llama/llama-3.1-8b-instruct:free") rawModel = "";
  var primary =
    !rawModel ||
    rawModel === "api/v1" ||
    rawModel === "v1" ||
    rawModel.indexOf("http://") === 0 ||
    rawModel.indexOf("https://") === 0
      ? DEFAULT_MR_MODEL
      : rawModel;
  var models = [];
  var seen = {};
  function pushModel(m) {
    if (!seen[m]) {
      seen[m] = true;
      models.push(m);
    }
  }
  if (primary === "meta-llama/llama-3.3-70b-instruct:free") {
    pushModel("openrouter/free");
  }
  pushModel(primary);
  for (var fi = 0; fi < FALLBACKS.length; fi++) pushModel(FALLBACKS[fi]);

  var hdr = {
    Authorization: "Bearer " + String(key).trim(),
    "Content-Type": "application/json",
  };
  var ref = String(process.env.OPENROUTER_HTTP_REFERER || process.env.VERCEL_URL || "").trim();
  if (ref) hdr["HTTP-Referer"] = ref.indexOf("http") === 0 ? ref : "https://" + ref;
  var xt = String(process.env.OPENROUTER_APP_TITLE || "").trim();
  if (xt) hdr["X-Title"] = xt.slice(0, 120);

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function backoffMs(round) {
    var idx = Math.min(round, BACKOFF.length - 1);
    return BACKOFF[idx];
  }
  function extractExhaustedModel(raw) {
    var m = String(raw || "").match(/limit_rpm\/([^/\s]+\/[^/\s]+)\//i);
    if (m && m[1]) return String(m[1]).trim();
    var alt = String(raw || "").match(/high demand for\s+([a-z0-9._-]+\/[a-z0-9._-]+):free/i);
    if (alt && alt[1]) return String(alt[1]).trim() + ":free";
    return "";
  }
  function parseChatJson(raw) {
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { kind: "err", detail: raw.slice(0, 400) };
    }
    var err = data.error;
    var hasC = data.choices && data.choices.length;
    if (err && !hasC) {
      var metaRaw = err.metadata && err.metadata.raw ? String(err.metadata.raw) : "";
      var blob = raw + " " + (err.message || "") + " " + metaRaw;
      var isRl =
        err.code === 429 ||
        /rate-?limit|temporarily rate-limited|"code"\s*:\s*429/i.test(blob) ||
        (err.message === "Provider returned error" && /429|rate-?limit|temporarily/i.test(blob));
      if (isRl) return { kind: "rl", exhaustedModel: extractExhaustedModel(blob) };
      return { kind: "err", detail: raw.slice(0, 400) };
    }
    var c0 = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof c0 === "string" && c0.trim()) return { kind: "ok", content: c0 };
    return { kind: "err", detail: raw.slice(0, 400) };
  }
  function httpRl(status, raw) {
    if (status === 429) return true;
    return /"code"\s*:\s*429|rate-?limit|temporarily rate-limited/i.test(raw);
  }

  var messages = [
    { role: "system", content: SYSTEM + "\n\n" + EXTRA_RULES },
    { role: "user", content: "请从以下正文提取任务与项目信息：\n\n" + text.slice(0, 120000) },
  ];

  var lastDetail = "";
  var sawRateLimit = false;
  var blockedModels = {};
  var mi, round;
  for (round = 0; round < MAX_ROUNDS; round++) {
    var roundHitRateLimit = false;
    for (mi = 0; mi < models.length; mi++) {
      if (blockedModels[models[mi]]) continue;
      var r = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          model: models[mi],
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: messages,
        }),
      });
      var raw = await r.text();
      if (r.status === 401) {
        return res.status(502).json({ ok: false, error: "OpenRouter 请求失败", detail: raw.slice(0, 400) });
      }
      if (!r.ok) {
        lastDetail = raw.slice(0, 400);
        if (httpRl(r.status, raw)) {
          roundHitRateLimit = true;
          var exhausted = extractExhaustedModel(raw);
          if (exhausted) blockedModels[exhausted] = true;
          if (/x-ratelimit-remaining"\s*:\s*"0"/i.test(raw)) blockedModels[models[mi]] = true;
          continue;
        }
        continue;
      }
      var pr = parseChatJson(raw);
      if (pr.kind === "ok") {
        var parsed;
        try {
          parsed = JSON.parse(pr.content);
        } catch (e2) {
          return res.status(502).json({ ok: false, error: "模型输出不是合法 JSON", detail: pr.content.slice(0, 240) });
        }
        return res.status(200).json({ ok: true, parsed: parsed });
      }
      if (pr.kind === "rl") {
        lastDetail = raw.slice(0, 400);
        roundHitRateLimit = true;
        if (pr.exhaustedModel) blockedModels[pr.exhaustedModel] = true;
        if (/x-ratelimit-remaining"\s*:\s*"0"/i.test(raw)) blockedModels[models[mi]] = true;
        continue;
      }
      lastDetail = pr.detail || raw.slice(0, 400);
      continue;
    }
    if (!roundHitRateLimit) break;
    sawRateLimit = true;
    await sleep(backoffMs(round));
  }
  return res.status(502).json({
    ok: false,
    error: sawRateLimit
      ? "OpenRouter 请求失败（免费模型短时限流，已自动轮询多模型并重试；请稍后再试，或在 OpenRouter 绑定自有提供商密钥提升额度）"
      : "OpenRouter 请求失败",
    detail: (lastDetail || "").slice(0, 400),
  });
};
