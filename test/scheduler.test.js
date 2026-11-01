const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPlan, remainingAtStart, hoursAvailable, habitsOn } = require("../src/scheduler.js");

const config = { weekdayHours: [4, 3, 3, 3, 3, 3, 5], overrides: {}, maxPerTaskPerDay: 3 };
const SUNDAY = "2026-11-01";
const task = (id, estimate, due, extra = {}) => ({ id, kind: "task", status: "todo", estimate, due, priority: 2, log: {}, ...extra });
const scheduled = plan => {
  const total = {};
  for (const d of plan.days) for (const b of d.blocks) total[b.taskId] = (total[b.taskId] || 0) + b.hours;
  return total;
};

test("uses the weekday default unless the day has an override", () => {
  assert.equal(hoursAvailable(config, SUNDAY), 4);
  assert.equal(hoursAvailable(config, "2026-11-02"), 3);
  assert.equal(hoursAvailable({ ...config, overrides: { [SUNDAY]: 1.5 } }, SUNDAY), 1.5);
});

test("schedules every remaining hour of every task", () => {
  const tasks = [task("a", 5, "2026-11-05"), task("b", 2.5, "2026-11-03"), task("c", 7, null)];
  assert.deepEqual(scheduled(buildPlan(tasks, config, SUNDAY)), { a: 5, b: 2.5, c: 7 });
});

test("earliest deadline goes first", () => {
  const plan = buildPlan([task("late", 1, "2026-11-20"), task("soon", 1, "2026-11-03")], config, SUNDAY);
  assert.deepEqual(plan.days[0].blocks.map(b => b.taskId), ["soon", "late"]);
});

test("never plans more than the day's free hours, after habits", () => {
  const habit = { id: "h", kind: "habit", status: "todo", minutes: 60, days: [0], log: {} };
  const plan = buildPlan([habit, task("big", 20, "2026-11-30")], config, SUNDAY);
  assert.equal(plan.days[0].habitHours, 1);
  for (const d of plan.days) {
    const used = d.blocks.reduce((s, b) => s + b.hours, 0);
    assert.ok(used + d.habitHours <= d.capacity + 1e-9, `${d.date} is overbooked`);
  }
});

test("caps the hours one task gets per day", () => {
  const plan = buildPlan([task("big", 20, "2026-11-30")], { ...config, maxPerTaskPerDay: 2 }, SUNDAY);
  for (const d of plan.days) for (const b of d.blocks) assert.ok(b.hours <= 2);
});

test("hours logged before today reduce the work; today's log does not change today's plan", () => {
  const t = task("a", 4, "2026-11-10", { log: { "2026-10-31": 1, [SUNDAY]: 2 } });
  assert.equal(remainingAtStart(t, SUNDAY), 3);
  assert.equal(buildPlan([t], config, SUNDAY).days[0].blocks[0].hours, 3);
});

test("finished and waiting tasks are not scheduled", () => {
  const plan = buildPlan([task("done", 2, null, { status: "done" }), task("wait", 2, null, { status: "waiting" })], config, SUNDAY);
  assert.deepEqual(scheduled(plan), {});
});

test("flags a deadline that cannot be met", () => {
  const plan = buildPlan([task("huge", 30, "2026-11-03")], config, SUNDAY);
  assert.deepEqual(plan.atRisk, ["huge"]);
  assert.equal(buildPlan([task("small", 2, "2026-11-03")], config, SUNDAY).atRisk.length, 0);
});

test("respects a task's notBefore date", () => {
  const plan = buildPlan([task("later", 1, null, { notBefore: "2026-11-04" })], config, SUNDAY);
  assert.equal(plan.days.findIndex(d => d.blocks.length), 3);
});

test("habits only appear on their days", () => {
  const habit = { id: "h", kind: "habit", status: "todo", minutes: 45, days: [1, 2], log: {} };
  assert.equal(habitsOn([habit], SUNDAY).length, 0);
  assert.equal(habitsOn([habit], "2026-11-02").length, 1);
});

test("the seed data plans without errors", () => {
  const plan = buildPlan(require("../data/tasks.json"), require("../data/config.json"), SUNDAY);
  assert.equal(plan.days.length, 42);
});
