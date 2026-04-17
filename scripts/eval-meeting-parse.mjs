import { readFileSync } from "node:fs";
import { join } from "node:path";

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function clamp(s, max) {
  return s.length <= max ? s : s.slice(0, max);
}
function normalizeNameList(raw) {
  const cleaned = raw
    .replace(/[，、;；/|]/g, ",")
    .replace(/\s+/g, " ")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/[（(].*?[）)]/g, "").trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const n of cleaned) if (!seen.has(n)) (seen.add(n), out.push(n));
  return out;
}
function extractAssigneeAndCollabs(task) {
  let assignee = asText(task.assignee);
  let collaborators = asText(task.collaborators);
  const combined = [asText(task.title), asText(task.description), asText(task.tags)].join(" ");
  if (!assignee) {
    const m =
      combined.match(/由\s*([^，。；;\s]+)\s*(?:负责|牵头)/) ||
      combined.match(/负责人[:：]\s*([^，。；;\s]+)/) ||
      combined.match(/([^，。；;\s]+)\s*[（(]主[)）]/);
    if (m) assignee = asText(m[1]);
  }
  if (!collaborators) {
    const m = combined.match(/(?:协作|配合|并由|支持)[:：]?\s*([^。；;]+)/);
    if (m) collaborators = asText(m[1]);
  }
  const aList = normalizeNameList(assignee);
  const cList = normalizeNameList(collaborators).filter((n) => !aList.includes(n));
  return { assignee: aList[0] || "", collaborators: cList.join(", ") };
}
function mapPriority(raw) {
  const t = raw.toUpperCase();
  if (/P[0-3]/.test(t)) return t.match(/P[0-3]/)[0];
  if (/紧急|最高|阻塞|critical|urgent/i.test(raw)) return "P0";
  if (/高|重要|high/i.test(raw)) return "P1";
  if (/低|low/i.test(raw)) return "P3";
  return "P2";
}
function mapStatus(raw) {
  const t = raw.toLowerCase();
  if (/done|完成|已完成|closed/.test(t)) return "done";
  if (/blocked|阻塞|卡住/.test(t)) return "blocked";
  if (/review|验收|待测|测试中/.test(t)) return "review";
  if (/doing|进行中|在做|开发中/.test(t)) return "doing";
  return "todo";
}
function weekdayToNum(w) {
  return { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[w] ?? -1;
}
function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseRelativeDate(raw, now) {
  const text = raw.trim();
  const ymd = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return `${Number(ymd[1])}-${String(Number(ymd[2])).padStart(2, "0")}-${String(Number(ymd[3])).padStart(2, "0")}`;
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (md) return `${now.getFullYear()}-${String(Number(md[1])).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
  if (/明天/.test(text)) return toYmd(new Date(now.getTime() + 86400000));
  if (/后天/.test(text)) return toYmd(new Date(now.getTime() + 86400000 * 2));
  const thisWeek = text.match(/本周([一二三四五六日天])/);
  if (thisWeek) {
    const d = new Date(now);
    const target = weekdayToNum(thisWeek[1]);
    const diff = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return toYmd(d);
  }
  const nextWeek = text.match(/下周([一二三四五六日天])/);
  if (nextWeek) {
    const d = new Date(now);
    const target = weekdayToNum(nextWeek[1]);
    const diff = ((target - d.getDay() + 7) % 7) + 7;
    d.setDate(d.getDate() + diff);
    return toYmd(d);
  }
  return "";
}
function normalizeTags(raw) {
  return clamp(normalizeNameList(raw.replace(/#/g, "").replace(/\s+/g, ",")).join(", "), 120);
}
function normalizeBaseline(input) {
  const o = input || {};
  const tasks = Array.isArray(o.tasks) ? o.tasks : [];
  const out = [];
  for (const t of tasks) {
    const title = asText(t.title);
    if (!title) continue;
    const pr = asText(t.priority).toUpperCase();
    const st = asText(t.status);
    const p = /^P[0-3]$/.test(pr) ? pr : "P2";
    const s = /^(todo|doing|blocked|review|done)$/.test(st) ? st : "todo";
    const dl = asText(t.deadline).match(/\d{4}-\d{2}-\d{2}/);
    out.push({
      title: clamp(title, 500),
      description: asText(t.description),
      assignee: asText(t.assignee),
      collaborators: asText(t.collaborators),
      deadline: dl ? dl[0] : "",
      priority: p,
      status: s,
      tags: asText(t.tags),
      pipelineStage: Math.max(0, parseInt(asText(t.pipelineStage) || "0", 10) || 0),
    });
  }
  return { tasks: out.slice(0, 80) };
}
function normalizeEnhanced(input, now) {
  const base = normalizeBaseline(input);
  const tasks = [];
  const seen = new Set();
  for (const rawTask of base.tasks) {
    const t = { ...rawTask };
    const ac = extractAssigneeAndCollabs(t);
    t.assignee = ac.assignee;
    t.collaborators = ac.collaborators;
    t.priority = mapPriority(`${rawTask.priority} ${rawTask.description} ${rawTask.tags}`);
    t.status = mapStatus(`${rawTask.status} ${rawTask.description}`);
    t.deadline = parseRelativeDate(`${rawTask.deadline} ${rawTask.description} ${rawTask.title}`, now);
    t.tags = normalizeTags(rawTask.tags);
    t.title = clamp(t.title.replace(/[【】[\]（）()]/g, " ").replace(/\s+/g, " ").trim(), 180);
    t.description = clamp(t.description.replace(/\s+/g, " ").trim(), 500);
    if (!t.title) continue;
    const k = `${t.title}|${t.assignee}|${t.deadline}`;
    if (seen.has(k)) continue;
    seen.add(k);
    tasks.push(t);
  }
  return { tasks: tasks.slice(0, 80) };
}
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function resolveRel(token, now) {
  if (token === "REL_TOMORROW") return ymd(new Date(now.getTime() + 86400000));
  if (token === "REL_DAY_AFTER_TOMORROW") return ymd(new Date(now.getTime() + 86400000 * 2));
  if (token === "REL_THIS_FRI") {
    const d = new Date(now);
    const diff = (5 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return ymd(d);
  }
  if (token === "REL_NEXT_WED") {
    const d = new Date(now);
    const diff = ((3 - d.getDay() + 7) % 7) + 7;
    d.setDate(d.getDate() + diff);
    return ymd(d);
  }
  return token;
}
function scoreOne(out, sample, now) {
  let hit = 0;
  let total = 0;
  if (typeof sample.expected.taskCount === "number") {
    total += 1;
    if (out.tasks.length === sample.expected.taskCount) hit += 1;
  }
  const expectedTasks = sample.expected.tasks || [];
  for (let i = 0; i < expectedTasks.length; i++) {
    const exp = expectedTasks[i];
    const got = out.tasks[i];
    if (!got) {
      total += Object.keys(exp).length;
      continue;
    }
    for (const [k, v] of Object.entries(exp)) {
      total += 1;
      if (k === "deadline") {
        if (got.deadline === resolveRel(String(v), now)) hit += 1;
      } else if (String(got[k] ?? "") === String(v)) {
        hit += 1;
      }
    }
  }
  return { hit, total };
}

const samples = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "meeting-parse-samples.json"), "utf8"));
const now = new Date("2026-04-17T10:00:00+08:00");
let bHit = 0;
let bTotal = 0;
let eHit = 0;
let eTotal = 0;
for (const s of samples) {
  const b = normalizeBaseline(s.input);
  const e = normalizeEnhanced(s.input, now);
  const bs = scoreOne(b, s, now);
  const es = scoreOne(e, s, now);
  bHit += bs.hit;
  bTotal += bs.total;
  eHit += es.hit;
  eTotal += es.total;
}
console.log(
  JSON.stringify(
    {
      samples: samples.length,
      baseline: { hit: bHit, total: bTotal, accuracy: `${((bHit / bTotal) * 100).toFixed(2)}%` },
      enhanced: { hit: eHit, total: eTotal, accuracy: `${((eHit / eTotal) * 100).toFixed(2)}%` },
    },
    null,
    2,
  ),
);
