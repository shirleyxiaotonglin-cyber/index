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
  var DEFAULT_MR_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
  var rawModel = String(
    process.env.OPENROUTER_MEETING_MODEL || process.env.OPENROUTER_MODEL || ""
  ).trim();
  var model =
    !rawModel ||
    rawModel === "api/v1" ||
    rawModel === "v1" ||
    rawModel.indexOf("http://") === 0 ||
    rawModel.indexOf("https://") === 0
      ? DEFAULT_MR_MODEL
      : rawModel;
  var hdr = {
    Authorization: "Bearer " + String(key).trim(),
    "Content-Type": "application/json",
  };
  var ref = String(process.env.OPENROUTER_HTTP_REFERER || process.env.VERCEL_URL || "").trim();
  if (ref) hdr["HTTP-Referer"] = ref.indexOf("http") === 0 ? ref : "https://" + ref;
  var xt = String(process.env.OPENROUTER_APP_TITLE || "").trim();
  if (xt) hdr["X-Title"] = xt.slice(0, 120);
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "请从以下正文提取任务与项目信息：\n\n" + text.slice(0, 120000) },
      ],
    }),
  });
  const raw = await r.text();
  if (!r.ok) {
    return res.status(502).json({ ok: false, error: "OpenRouter 请求失败", detail: raw.slice(0, 400) });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return res.status(502).json({ ok: false, error: "接口返回非 JSON", detail: raw.slice(0, 200) });
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content || typeof content !== "string") {
    return res.status(502).json({ ok: false, error: "模型未返回内容", detail: raw.slice(0, 200) });
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return res.status(502).json({ ok: false, error: "模型输出不是合法 JSON", detail: content.slice(0, 240) });
  }
  return res.status(200).json({ ok: true, parsed: parsed });
};
