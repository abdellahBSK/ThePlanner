import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS, addDays, shiftDate, buildIcs, buildPlan, buildTimeline, hoursAvailable, nowIn, parseDate, parseQuickAdd,
  remainingAtStart, type Habit, type Settings, type Task,
} from "../src";

const SUNDAY = "2026-11-01";
const settings: Settings = { ...DEFAULT_SETTINGS, weekdayHours: [4, 3, 3, 3, 3, 3, 5], maxPerTaskPerDay: 3 };

function task(id: string, estimate: number, due: string | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, projectId: null, estimate, due, dueConfirmed: true, priority: 2, status: "todo",
    notBefore: null, notes: "", link: "", log: {}, createdAt: SUNDAY, doneAt: null, ...extra,
  };
}
const habit = (minutes: number, days: number[]): Habit => ({ id: "h", title: "Practice", minutes, days, link: "", active: true, log: {} });
const totals = (plan: ReturnType<typeof buildPlan>) => {
  const out: Record<string, number> = {};
  for (const d of plan.days) for (const b of d.blocks) out[b.taskId] = (out[b.taskId] ?? 0) + b.hours;
  return out;
};

describe("scheduler", () => {
  it("uses weekday hours unless a date is overridden", () => {
    expect(hoursAvailable(settings, SUNDAY)).toBe(4);
    expect(hoursAvailable(settings, addDays(SUNDAY, 1))).toBe(3);
    expect(hoursAvailable({ ...settings, overrides: { [SUNDAY]: 1.5 } }, SUNDAY)).toBe(1.5);
  });

  it("schedules every remaining hour", () => {
    const plan = buildPlan([task("a", 5, "2026-11-05"), task("b", 2.5, "2026-11-03"), task("c", 7, null)], [], settings, SUNDAY);
    expect(totals(plan)).toEqual({ a: 5, b: 2.5, c: 7 });
  });

  it("puts the earliest deadline first, then the higher priority", () => {
    const plan = buildPlan(
      [task("late", 1, "2026-11-20"), task("soon", 1, "2026-11-03"), task("soon-high", 1, "2026-11-03", { priority: 3 })],
      [], settings, SUNDAY,
    );
    expect(plan.days[0].blocks.map(b => b.taskId)).toEqual(["soon-high", "soon", "late"]);
  });

  it("never overbooks a day and leaves room for habits", () => {
    const plan = buildPlan([task("big", 40, "2026-12-30")], [habit(60, [0, 1, 2, 3, 4, 5, 6])], settings, SUNDAY);
    expect(plan.days[0].habitHours).toBe(1);
    for (const d of plan.days) {
      const used = d.blocks.reduce((s, b) => s + b.hours, 0);
      expect(used + d.habitHours).toBeLessThanOrEqual(d.capacity + 1e-9);
    }
  });

  it("caps hours on one task per day", () => {
    const plan = buildPlan([task("big", 20, null)], [], { ...settings, maxPerTaskPerDay: 2 }, SUNDAY);
    for (const d of plan.days) for (const b of d.blocks) expect(b.hours).toBeLessThanOrEqual(2);
  });

  it("counts work logged before today, but not today's", () => {
    const t = task("a", 4, null, { log: { "2026-10-31": 1, [SUNDAY]: 2 } });
    expect(remainingAtStart(t, SUNDAY)).toBe(3);
    expect(buildPlan([t], [], settings, SUNDAY).days[0].blocks[0].hours).toBe(3);
  });

  it("skips finished and waiting tasks and respects notBefore", () => {
    const plan = buildPlan(
      [task("done", 2, null, { status: "done" }), task("wait", 2, null, { status: "waiting" }), task("later", 1, null, { notBefore: "2026-11-04" })],
      [], settings, SUNDAY,
    );
    expect(Object.keys(totals(plan))).toEqual(["later"]);
    expect(plan.days.findIndex(d => d.blocks.length)).toBe(3);
  });

  it("flags deadlines that can't be met", () => {
    expect(buildPlan([task("huge", 30, "2026-11-03")], [], settings, SUNDAY).atRisk).toEqual(["huge"]);
    expect(buildPlan([task("small", 2, "2026-11-03")], [], settings, SUNDAY).atRisk).toEqual([]);
  });
});

describe("timeline", () => {
  it("lays habits then blocks on the clock with breaks", () => {
    const plan = buildPlan([task("a", 1.5, "2026-11-03"), task("b", 0.5, "2026-11-04")], [habit(45, [1])], settings, "2026-11-02");
    const items = buildTimeline(plan.days[0], [habit(45, [1])], { ...settings, breakMinutes: 10 });
    expect(items.map(i => `${i.kind}:${i.start}-${i.end}`)).toEqual([
      "habit:18:00-18:45", "task:18:55-20:25", "task:20:35-21:05",
    ]);
  });

  it("starts the remaining work from the current time and skips finished items", () => {
    const plan = buildPlan([task("a", 1, "2026-11-03"), task("b", 1, "2026-11-04")], [], settings, "2026-11-02");
    const items = buildTimeline(plan.days[0], [], { ...settings, breakMinutes: 0 }, { startAt: 19 * 60 + 20, skip: (_k, id) => id === "a" });
    expect(items.map(i => `${i.id}:${i.start}`)).toEqual(["b:19:20"]);
  });

  it("marks items that run past midnight", () => {
    const late = { ...settings, dayStart: Array(7).fill("23:00"), weekdayHours: Array(7).fill(3) };
    const plan = buildPlan([task("a", 3, null)], [], late, SUNDAY);
    expect(buildTimeline(plan.days[0], [], late)[0].overflow).toBe(true);
  });
});

describe("dates", () => {
  it("reads the local date and minute in a time zone", () => {
    const at = new Date("2026-11-01T23:30:00Z");
    expect(nowIn("Africa/Casablanca", at)).toEqual({ date: "2026-11-01", minutes: 23 * 60 + 30 });
    expect(nowIn("Asia/Tokyo", at).date).toBe("2026-11-02");
  });

  it("parses the ways people write dates", () => {
    expect(parseDate("today", SUNDAY)?.date).toBe(SUNDAY);
    expect(parseDate("tomorrow", SUNDAY)?.date).toBe("2026-11-02");
    expect(parseDate("fri", SUNDAY)?.date).toBe("2026-11-06");
    expect(parseDate("sun", SUNDAY)?.date).toBe("2026-11-08");
    expect(parseDate("next fri", SUNDAY)?.date).toBe("2026-11-13");
    expect(parseDate("in 3 days", SUNDAY)?.date).toBe("2026-11-04");
    expect(parseDate("7/11", SUNDAY)?.date).toBe("2026-11-07");
    expect(parseDate("nov 20", SUNDAY)?.date).toBe("2026-11-20");
    expect(parseDate("3 jan", SUNDAY)?.date).toBe("2027-01-03");
    expect(parseDate("2026-12-01", SUNDAY)?.date).toBe("2026-12-01");
    expect(parseDate("banana", SUNDAY)).toBeNull();
  });
});

describe("quick add", () => {
  it("pulls estimate, deadline, project and priority out of one line", () => {
    expect(parseQuickAdd("Lab 3 cyber report 4h due fri #Cyber-Security !high", SUNDAY)).toEqual({
      title: "Lab 3 cyber report", estimate: 4, due: "2026-11-06", priority: 3, project: "Cyber Security", repeat: null,
    });
  });

  it("understands minutes and leaves plain titles alone", () => {
    expect(parseQuickAdd("Read chapter 2 90m by tomorrow", SUNDAY)).toMatchObject({ title: "Read chapter 2", estimate: 1.5, due: "2026-11-02" });
    expect(parseQuickAdd("Call the bank", SUNDAY)).toEqual({ title: "Call the bank", estimate: null, due: null, priority: null, project: null, repeat: null });
  });

  it("keeps 'due' in the title when no date follows it", () => {
    expect(parseQuickAdd("Pay the due fees", SUNDAY).title).toBe("Pay the due fees");
  });
});

describe("calendar feed", () => {
  it("writes valid iCalendar with escaped, folded text", () => {
    const ics = buildIcs(
      [{ uid: "a@x", date: SUNDAY, start: "23:30", minutes: 60, title: "Lab, part 1; long title ".repeat(4), description: "line1\nline2" }],
      { name: "Plan", timeZone: "Africa/Casablanca", now: new Date("2026-11-01T00:00:00Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;TZID=Africa/Casablanca:20261101T233000");
    expect(ics).toContain("DTEND;TZID=Africa/Casablanca:20261102T003000");
    expect(ics).toContain("Lab\\, part 1\\; long");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("shiftDate", () => {
  it("shifts by days and weeks", () => {
    expect(shiftDate("2026-11-30", "day", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-12-28", "week", 2)).toBe("2027-01-11");
  });

  it("shifts by months and clamps to the end of the month", () => {
    expect(shiftDate("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftDate("2028-01-31", "month", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-03-31", "month", 1)).toBe("2026-04-30");
    expect(shiftDate("2026-11-15", "month", 3)).toBe("2027-02-15");
    expect(shiftDate("2026-12-31", "month", 12)).toBe("2027-12-31");
    expect(shiftDate("2024-02-29", "month", 12)).toBe("2025-02-28");
  });
});

describe("quick add repeat", () => {
  it("reads every day, week or month", () => {
    expect(parseQuickAdd("Water plants every week", SUNDAY)).toMatchObject({ title: "Water plants", repeat: { unit: "week", interval: 1 } });
    expect(parseQuickAdd("Standup every day due fri", SUNDAY)).toMatchObject({ title: "Standup", due: "2026-11-06", repeat: { unit: "day", interval: 1 } });
  });

  it("reads every N units and ignores out-of-range counts", () => {
    expect(parseQuickAdd("Rent every 2 months", SUNDAY).repeat).toEqual({ unit: "month", interval: 2 });
    expect(parseQuickAdd("Backup every 3 days 1h", SUNDAY)).toMatchObject({ title: "Backup", estimate: 1, repeat: { unit: "day", interval: 3 } });
    expect(parseQuickAdd("Odd every 0 days", SUNDAY).repeat).toBeNull();
    expect(parseQuickAdd("Odd every 400 days", SUNDAY).repeat).toBeNull();
  });
});

describe("shiftDate edge cases", () => {
  it("keeps leap days and crosses year ends", () => {
    expect(shiftDate("2028-02-29", "month", 1)).toBe("2028-03-29");
    expect(shiftDate("2027-02-28", "month", 1)).toBe("2027-03-28");
    expect(shiftDate("2026-12-31", "month", 1)).toBe("2027-01-31");
    expect(shiftDate("2028-02-28", "day", 1)).toBe("2028-02-29");
    expect(shiftDate("2027-02-28", "day", 1)).toBe("2027-03-01");
  });

  it("handles the largest interval", () => {
    expect(shiftDate("2026-11-17", "day", 365)).toBe("2027-11-17");
    expect(shiftDate("2026-11-17", "month", 365)).toBe("2057-04-17");
  });
});

describe("quick add repeat edge cases", () => {
  it("reads every day and every 3 weeks", () => {
    expect(parseQuickAdd("Water plants every day", SUNDAY)).toEqual({
      title: "Water plants", estimate: null, due: null, priority: null, project: null, repeat: { unit: "day", interval: 1 },
    });
    expect(parseQuickAdd("Backup every 3 weeks", SUNDAY)).toMatchObject({ title: "Backup", repeat: { unit: "week", interval: 3 } });
    expect(parseQuickAdd("Check every 365 days", SUNDAY).repeat).toEqual({ unit: "day", interval: 365 });
  });

  it("leaves ordinary uses of 'every' in the title", () => {
    expect(parseQuickAdd("Read every chapter", SUNDAY)).toMatchObject({ title: "Read every chapter", repeat: null });
    expect(parseQuickAdd("Plan every weekday", SUNDAY)).toMatchObject({ title: "Plan every weekday", repeat: null });
    expect(parseQuickAdd("Review every monthly summary", SUNDAY)).toMatchObject({ title: "Review every monthly summary", repeat: null });
    expect(parseQuickAdd("Check every 366 days", SUNDAY)).toMatchObject({ title: "Check every 366 days", repeat: null });
    expect(parseQuickAdd("Read every 2 hours", SUNDAY).repeat).toBeNull();
  });
});
