// Focus Board scheduler: pure functions, no DOM.
// Fills each day's available hours with work, earliest due date first.

const DAY_MS = 86400000;

function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseIso(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); }
function daysBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / DAY_MS); }
function weekday(s) { return parseIso(s).getDay(); }

function hoursAvailable(config, date) {
  const o = config.overrides && config.overrides[date];
  if (typeof o === "number") return o;
  const w = (config.weekdayHours || [3, 3, 3, 3, 3, 3, 3])[weekday(date)];
  return typeof w === "number" ? w : 3;
}

function habitsOn(items, date) {
  return items.filter(t => t.kind === "habit" && t.status !== "archived" && (t.days || []).includes(weekday(date)));
}

function loggedBefore(task, date) {
  let sum = 0;
  for (const [d, h] of Object.entries(task.log || {})) if (d < date) sum += h;
  return sum;
}

/** Hours still to do on a task as of the start of `today`. */
function remainingAtStart(task, today) {
  return Math.max(0, round2((task.estimate || 0) - loggedBefore(task, today)));
}

function round2(x) { return Math.round(x * 100) / 100; }

function compareTasks(a, b) {
  const da = a.due || "9999-12-31", dbb = b.due || "9999-12-31";
  if (da !== dbb) return da < dbb ? -1 : 1;
  if ((b.priority || 2) !== (a.priority || 2)) return (b.priority || 2) - (a.priority || 2);
  return (a.estimate || 0) - (b.estimate || 0);
}

/**
 * Build a plan for `horizon` days starting at `today`.
 * Returns { days: [{date, capacity, habitHours, free, blocks:[{taskId, hours}]}], finish: {taskId: date|null}, atRisk: [taskId] }
 */
function buildPlan(items, config, today, horizon = 42) {
  const maxPer = config.maxPerTaskPerDay || 3;
  const queue = items
    .filter(t => t.kind !== "habit" && t.status === "todo" && remainingAtStart(t, today) > 0)
    .sort(compareTasks);
  const rem = new Map(queue.map(t => [t.id, remainingAtStart(t, today)]));
  const finish = {};
  const days = [];

  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const capacity = hoursAvailable(config, date);
    const habitHours = round2(habitsOn(items, date).reduce((s, h) => s + (h.minutes || 0) / 60, 0));
    let free = Math.max(0, round2(capacity - habitHours));
    const blocks = [];
    for (const t of queue) {
      if (free < 0.25) break;
      const r = rem.get(t.id);
      if (r <= 0) continue;
      if (t.notBefore && t.notBefore > date) continue;
      let take = Math.min(r, free, maxPer);
      // Work in quarter-hour steps, except to finish a task off.
      if (take < r) take = Math.floor(take * 4) / 4;
      if (take <= 0) continue;
      take = round2(take);
      blocks.push({ taskId: t.id, hours: take });
      rem.set(t.id, round2(r - take));
      free = round2(free - take);
      if (rem.get(t.id) <= 0) finish[t.id] = date;
    }
    days.push({ date, capacity, habitHours, free, blocks });
  }
  for (const t of queue) if (!(t.id in finish)) finish[t.id] = null;
  const atRisk = queue.filter(t => t.due && (finish[t.id] === null || finish[t.id] > t.due)).map(t => t.id);
  return { days, finish, atRisk };
}

if (typeof module !== "undefined") module.exports = { buildPlan, remainingAtStart, hoursAvailable, habitsOn, addDays, daysBetween, isoDate, parseIso, weekday };
