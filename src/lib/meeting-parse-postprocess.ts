export type ParsedTask = {
  title: string;
  description: string;
  assignee: string;
  collaborators: string;
  deadline: string;
  priority: "P0" | "P1" | "P2" | "P3";
  status: "todo" | "doing" | "blocked" | "review" | "done";
  tags: string;
  pipelineStage: number;
};

export type NormalizedMeetingParsed = {
  projectName: string | null;
  renameProject: string | null;
  chainHint: boolean;
  pipelineStages: string[] | null;
  tasks: ParsedTask[];
};

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function normalizeNameList(raw: string): string[] {
  const cleaned = raw
    .replace(/[，、;；/|]/g, ",")
    .replace(/\s+/g, " ")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/[（(].*?[）)]/g, "").trim())
    .filter(Boolean);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const n of cleaned) {
    if (!seen.has(n)) {
      seen.add(n);
      uniq.push(n);
    }
  }
  return uniq;
}

function extractAssigneeAndCollabs(task: Record<string, unknown>): { assignee: string; collaborators: string } {
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
  return {
    assignee: aList[0] || "",
    collaborators: cList.join(", "),
  };
}

function mapPriority(raw: string): "P0" | "P1" | "P2" | "P3" {
  const t = raw.toUpperCase();
  if (/P[0-3]/.test(t)) return t.match(/P[0-3]/)![0] as "P0" | "P1" | "P2" | "P3";
  if (/紧急|最高|阻塞|critical|urgent/i.test(raw)) return "P0";
  if (/高|重要|high/i.test(raw)) return "P1";
  if (/低|low/i.test(raw)) return "P3";
  return "P2";
}

function mapStatus(raw: string): "todo" | "doing" | "blocked" | "review" | "done" {
  const t = raw.toLowerCase();
  if (/done|完成|已完成|closed/.test(t)) return "done";
  if (/blocked|阻塞|卡住/.test(t)) return "blocked";
  if (/review|验收|待测|测试中/.test(t)) return "review";
  if (/doing|进行中|在做|开发中/.test(t)) return "doing";
  return "todo";
}

function weekdayToNum(w: string): number {
  const m: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  return m[w] ?? -1;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseRelativeDate(raw: string, now: Date): string {
  const text = raw.trim();
  const ymd = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = String(Number(ymd[2])).padStart(2, "0");
    const d = String(Number(ymd[3])).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (md) {
    const year = now.getFullYear();
    return `${year}-${String(Number(md[1])).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
  }
  if (/明天/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toYmd(d);
  }
  if (/后天/.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return toYmd(d);
  }
  const thisWeek = text.match(/本周([一二三四五六日天])/);
  if (thisWeek) {
    const target = weekdayToNum(thisWeek[1]);
    if (target >= 0) {
      const d = new Date(now);
      const diff = (target - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      return toYmd(d);
    }
  }
  const nextWeek = text.match(/下周([一二三四五六日天])/);
  if (nextWeek) {
    const target = weekdayToNum(nextWeek[1]);
    if (target >= 0) {
      const d = new Date(now);
      const diff = ((target - d.getDay() + 7) % 7) + 7;
      d.setDate(d.getDate() + diff);
      return toYmd(d);
    }
  }
  return "";
}

function normalizeTags(raw: string): string {
  const list = normalizeNameList(raw.replace(/#/g, "").replace(/\s+/g, ","));
  return clamp(list.join(", "), 120);
}

function normalizeStages(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map(asText).filter(Boolean).map((x) => clamp(x, 60));
  return out.length ? out : null;
}

export function normalizeMeetingParsedBaseline(input: unknown): NormalizedMeetingParsed {
  const o = (input || {}) as Record<string, unknown>;
  const tasks = Array.isArray(o.tasks) ? o.tasks : [];
  const out: ParsedTask[] = [];
  for (const task of tasks) {
    const t = (task || {}) as Record<string, unknown>;
    const title = asText(t.title);
    if (!title) continue;
    const pr = asText(t.priority).toUpperCase();
    const st = asText(t.status);
    const p = /^P[0-3]$/.test(pr) ? (pr as ParsedTask["priority"]) : "P2";
    const s = /^(todo|doing|blocked|review|done)$/.test(st) ? (st as ParsedTask["status"]) : "todo";
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
      pipelineStage: Math.max(0, Number.parseInt(asText(t.pipelineStage) || "0", 10) || 0),
    });
  }
  return {
    projectName: asText(o.projectName) || null,
    renameProject: asText(o.renameProject) || null,
    chainHint: !!o.chainHint,
    pipelineStages: normalizeStages(o.pipelineStages),
    tasks: out.slice(0, 80),
  };
}

export function normalizeMeetingParsedEnhanced(input: unknown, now = new Date()): NormalizedMeetingParsed {
  const base = normalizeMeetingParsedBaseline(input);
  const tasks: ParsedTask[] = [];
  const seen = new Set<string>();
  for (const rawTask of base.tasks) {
    const t = { ...rawTask };
    const ac = extractAssigneeAndCollabs(t as unknown as Record<string, unknown>);
    t.assignee = ac.assignee;
    t.collaborators = ac.collaborators;
    t.priority = mapPriority(`${rawTask.priority} ${rawTask.description} ${rawTask.tags}`);
    t.status = mapStatus(`${rawTask.status} ${rawTask.description}`);
    t.deadline = parseRelativeDate(`${rawTask.deadline} ${rawTask.description} ${rawTask.title}`, now);
    t.tags = normalizeTags(rawTask.tags);
    t.title = clamp(t.title.replace(/[【】[\]（）()]/g, " ").replace(/\s+/g, " ").trim(), 180);
    t.description = clamp(t.description.replace(/\s+/g, " ").trim(), 500);
    if (!t.title) continue;
    const dedupKey = `${t.title}|${t.assignee}|${t.deadline}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    tasks.push(t);
  }
  return {
    ...base,
    tasks: tasks.slice(0, 80),
  };
}
