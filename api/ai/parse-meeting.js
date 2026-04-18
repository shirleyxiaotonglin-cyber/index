/**
 * Vercel Node Serverless（纯静态 index.html 部署时使用；与 src/app/api/ai/parse-meeting 行为一致）
 * Next.js 构建会忽略此目录；仅「非 Next」或仅静态输出时生效。
 */
const { runMeetingParseFromText } = require("./meeting-parse-core");

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
  const out = await runMeetingParseFromText(text);
  if (!out.ok) {
    const status = out.status || 502;
    return res.status(status).json({ ok: false, error: out.error, detail: out.detail });
  }
  return res.status(200).json({ ok: true, parsed: out.parsed });
};
