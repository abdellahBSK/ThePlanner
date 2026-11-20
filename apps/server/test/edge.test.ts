import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { calendarFeed, scheduleFor } from "../src/plan";
import { dueReminders } from "../src/reminders";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "theplanner-edge-"));
  const config = loadConfig({ DATA_DIR: dir, PORT: "3999" });
  return { ...createApp(openDb(":memory:"), config), config };
}
type Ctx = ReturnType<typeof setup>;

async function signedIn(ctx: Ctx, email: string, settings: Record<string, unknown> = {}) {
  const agent = request.agent(ctx.app);
  const res = await agent.post("/api/auth/signup").send({ name: "Edge", email, password: "correct horse", timezone: "UTC" });
  expect(res.status).toBe(201);
  if (Object.keys(settings).length) await agent.patch("/api/settings").send(settings).expect(200);
  const userId = (await agent.get("/api/auth/me")).body.user.id as string;
  return { agent, userId };
}

const DAILY = {
  weekdayHours: Array(7).fill(3), dayStart: Array(7).fill("09:00"), morningTime: "08:00", remindBeforeMinutes: 0, breakMinutes: 10,
};
const at = (iso: string) => new Date(iso);
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

describe("reminders and plan across DST", () => {
  // zone, local day, UTC instant of 08:00 local, UTC instant of 09:00 local, next local day
  const cases = [
    ["America/New_York", "2026-03-08", "2026-03-08T12:00:00Z", "2026-03-08T13:00:00Z", "2026-03-09"],
    ["America/New_York", "2026-11-01", "2026-11-01T13:00:00Z", "2026-11-01T14:00:00Z", "2026-11-02"],
    ["Europe/Paris", "2026-03-29", "2026-03-29T06:00:00Z", "2026-03-29T07:00:00Z", "2026-03-30"],
  ] as const;

  for (const [zone, day, eightIso, nine, next] of cases) {
    const eight = at(eightIso);

    it(`sends reminders at the right local minute on ${day} in ${zone}`, async () => {
      const ctx = setup();
      const { agent, userId } = await signedIn(ctx, "dst@example.com", { ...DAILY, timezone: zone });
      await agent.post("/api/habits").send({ title: "Read", minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] }).expect(201);
      await agent.post("/api/tasks").send({ title: "Lab", estimate: 2, due: "2099-01-01" }).expect(201);

      const morning = dueReminders(ctx.repo, userId, eight);
      expect(morning.map(r => r.key)).toEqual([`morning:${day}`]);
      expect(morning[0].message.title).toBe("Today: 2h 30m planned");

      // 09:00 local: the habit block starts now; the task starts at 09:40.
      const habitNow = dueReminders(ctx.repo, userId, at(nine));
      expect(habitNow.map(r => r.message.title)).toEqual(["Now: Read"]);
      expect(habitNow[0].key.startsWith(`block:${day}:habit:`)).toBe(true);

      // an hour later, or 07:30 local, is not a block time, so nothing is due
      expect(dueReminders(ctx.repo, userId, plus(at(nine), 60))).toEqual([]);
      expect(dueReminders(ctx.repo, userId, plus(at(nine), -90))).toEqual([]);

      const task = dueReminders(ctx.repo, userId, plus(at(nine), 40));
      expect(task.map(r => r.message.title)).toEqual(["Now: Lab"]);
      expect(task[0].message.body).toBe("09:40–11:40 · 2h");
      expect(task[0].key.startsWith(`block:${day}:task:`)).toBe(true);
    });

    it(`plans consecutive days with no lost or repeated date around ${day} in ${zone}`, async () => {
      const ctx = setup();
      const { agent, userId } = await signedIn(ctx, "dst2@example.com", { ...DAILY, timezone: zone });
      await agent.post("/api/habits").send({ title: "Read", minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] }).expect(201);
      const user = ctx.repo.getUser(userId)!;
      const start = plus(at(nine), -8 * 60); // 00:00 local on the start day
      const items = scheduleFor(user, ctx.repo.state(userId), 5, start);
      const dates = items.map(i => i.date);
      const [y, m, d] = day.split("-").map(Number);
      const expected = Array.from({ length: 5 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
      expect(dates).toEqual(expected);
      expect(dates[1]).toBe(next);
      expect(items).toHaveLength(5);
      expect(new Set(dates).size).toBe(5);
      expect(items.every(i => i.start === "09:00")).toBe(true);
    });
  }

  it("keeps the local date at the last minute before midnight on a DST day", async () => {
    const ctx = setup();
    const { agent, userId } = await signedIn(ctx, "late@example.com", { ...DAILY, timezone: "America/New_York" });
    await agent.post("/api/habits").send({ title: "Read", minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] }).expect(201);
    const user = ctx.repo.getUser(userId)!;
    const data = ctx.repo.state(userId);
    // 2026-03-08 23:59 EDT = 03:59Z on the 9th
    expect(scheduleFor(user, data, 1, at("2026-03-09T03:59:00Z")).map(i => i.date)).toEqual(["2026-03-08"]);
    expect(scheduleFor(user, data, 1, at("2026-03-09T04:00:00Z")).map(i => i.date)).toEqual(["2026-03-09"]);
  });

  it("emits a calendar feed carrying the user's DST zone", async () => {
    const ctx = setup();
    const { agent, userId } = await signedIn(ctx, "ics@example.com", { ...DAILY, timezone: "Europe/Paris" });
    await agent.post("/api/habits").send({ title: "Read", minutes: 30, days: [0, 1, 2, 3, 4, 5, 6] }).expect(201);
    const feed = calendarFeed(ctx.repo.getUser(userId)!, ctx.repo.state(userId), "http://x");
    expect(feed).toContain("Europe/Paris");
    expect(feed).toContain("Practice: Read");
  });
});

describe("empty plans", () => {
  it("says nothing is planned when the user has no tasks", async () => {
    const ctx = setup();
    const { userId } = await signedIn(ctx, "empty@example.com", { ...DAILY });
    const morning = dueReminders(ctx.repo, userId, at("2026-11-02T08:00:00Z"));
    expect(morning).toHaveLength(1);
    expect(morning[0].message.title).toBe("Nothing planned today");
    expect(dueReminders(ctx.repo, userId, at("2026-11-02T09:00:00Z"))).toEqual([]);
    expect(scheduleFor(ctx.repo.getUser(userId)!, ctx.repo.state(userId), 14, at("2026-11-02T08:00:00Z"))).toEqual([]);
  });

  it("plans nothing when every task is done", async () => {
    const ctx = setup();
    const { agent, userId } = await signedIn(ctx, "done@example.com", { ...DAILY });
    const t = (await agent.post("/api/tasks").send({ title: "Old", estimate: 2, due: "2026-11-05" })).body;
    await agent.patch(`/api/tasks/${t.id}`).send({ status: "done" }).expect(200);
    const items = scheduleFor(ctx.repo.getUser(userId)!, ctx.repo.state(userId), 7, at("2026-11-02T08:00:00Z"));
    expect(items).toEqual([]);
    expect(dueReminders(ctx.repo, userId, at("2026-11-02T08:00:00Z"))[0].message.title).toBe("Nothing planned today");
  });

  it("does not crash or place work on days with zero free hours", async () => {
    const ctx = setup();
    const { agent, userId } = await signedIn(ctx, "busy@example.com", { ...DAILY, weekdayHours: Array(7).fill(0) });
    await agent.post("/api/tasks").send({ title: "Big", estimate: 5, due: "2026-11-10" }).expect(201);
    const items = scheduleFor(ctx.repo.getUser(userId)!, ctx.repo.state(userId), 14, at("2026-11-02T08:00:00Z"));
    expect(items.filter(i => i.kind === "task")).toEqual([]);
    expect(() => dueReminders(ctx.repo, userId, at("2026-11-02T08:00:00Z"))).not.toThrow();
  });

  it("still serves a valid, empty calendar feed", async () => {
    const ctx = setup();
    const { agent } = await signedIn(ctx, "feed@example.com");
    const { url } = (await agent.get("/api/calendar")).body;
    const feed = await request(ctx.app).get(new URL(url).pathname);
    expect(feed.status).toBe(200);
    expect(feed.text).toContain("BEGIN:VCALENDAR");
    expect(feed.text).toContain("END:VCALENDAR");
    expect(feed.text).not.toContain("BEGIN:VEVENT");
  });

  it("returns no reminders for an unknown user", () => {
    const ctx = setup();
    expect(dueReminders(ctx.repo, "nobody", at("2026-11-02T08:00:00Z"))).toEqual([]);
  });
});

describe("cross-user isolation returns 404", () => {
  async function twoUsers() {
    const ctx = setup();
    const a = await signedIn(ctx, "a@example.com");
    const b = await signedIn(ctx, "b@example.com");
    return { ctx, a: a.agent, b: b.agent };
  }

  it("hides, rejects and preserves another user's task", async () => {
    const { a, b } = await twoUsers();
    const task = (await a.post("/api/tasks").send({ title: "Secret", estimate: 1 })).body;
    expect((await b.get("/api/state")).body.tasks).toEqual([]);
    expect((await b.patch(`/api/tasks/${task.id}`).send({ title: "Mine" })).status).toBe(404);
    expect((await b.patch(`/api/tasks/${task.id}`).send({ status: "done" })).status).toBe(404);
    expect((await b.delete(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await b.put("/api/logs").send({ itemId: task.id, date: "2026-11-02", hours: 1 })).status).toBe(404);
    const mine = (await a.get("/api/state")).body.tasks;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "Secret", status: "todo", log: {} });
  });

  it("hides, rejects and preserves another user's project", async () => {
    const { a, b } = await twoUsers();
    const project = (await a.post("/api/projects").send({ name: "Private", color: "#4f7cff" })).body;
    expect((await b.get("/api/state")).body.projects).toEqual([]);
    expect((await b.patch(`/api/projects/${project.id}`).send({ name: "Hijacked" })).status).toBe(404);
    expect((await b.delete(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await a.get("/api/state")).body.projects[0].name).toBe("Private");
  });

  it("refuses to attach a task to another user's project", async () => {
    const { a, b } = await twoUsers();
    const project = (await a.post("/api/projects").send({ name: "Private", color: "#4f7cff" })).body;
    // 400 "Project not found" is intentional: identical to a nonexistent project, so no existence oracle
    expect((await b.post("/api/tasks").send({ title: "Sneaky", estimate: 1, projectId: project.id })).status).toBe(400);
    const own = (await b.post("/api/tasks").send({ title: "Own", estimate: 1 })).body;
    expect((await b.patch(`/api/tasks/${own.id}`).send({ projectId: project.id })).status).toBe(400);
    expect((await b.get("/api/state")).body.tasks[0].projectId).toBeNull();
  });

  it("gives each user a separate project when both use the same project name", async () => {
    const { a, b } = await twoUsers();
    const ta = (await a.post("/api/tasks").send({ title: "x", estimate: 1, projectName: "Shared" })).body;
    const tb = (await b.post("/api/tasks").send({ title: "y", estimate: 1, projectName: "Shared" })).body;
    expect(ta.projectId).toBeTruthy();
    expect(tb.projectId).toBeTruthy();
    expect(ta.projectId).not.toBe(tb.projectId);
  });

  it("hides, rejects and preserves another user's habit", async () => {
    const { a, b } = await twoUsers();
    const habit = (await a.post("/api/habits").send({ title: "Read", minutes: 30, days: [1] })).body;
    expect((await b.get("/api/state")).body.habits).toEqual([]);
    expect((await b.patch(`/api/habits/${habit.id}`).send({ active: false })).status).toBe(404);
    expect((await b.delete(`/api/habits/${habit.id}`)).status).toBe(404);
    expect((await b.put("/api/logs").send({ itemId: habit.id, date: "2026-11-02", hours: 1 })).status).toBe(404);
    expect((await a.get("/api/state")).body.habits[0]).toMatchObject({ title: "Read", active: true });
  });

  it("answers 404 for ids that do not exist at all", async () => {
    const { b } = await twoUsers();
    expect((await b.patch("/api/tasks/nope").send({ title: "x" })).status).toBe(404);
    expect((await b.delete("/api/tasks/nope")).status).toBe(404);
    expect((await b.patch("/api/habits/nope").send({ active: false })).status).toBe(404);
    expect((await b.patch("/api/projects/nope").send({ name: "x" })).status).toBe(404);
  });

  it("keeps settings and calendar links separate", async () => {
    const { ctx, a, b } = await twoUsers();
    await a.patch("/api/settings").send({ morningTime: "06:30" }).expect(200);
    expect((await b.get("/api/auth/me")).body.user.settings.morningTime).toBe("08:00");
    const urlA = (await a.get("/api/calendar")).body.url as string;
    const urlB = (await b.get("/api/calendar")).body.url as string;
    expect(urlA).not.toBe(urlB);
    await b.post("/api/calendar/rotate").expect(200);
    expect((await request(ctx.app).get(new URL(urlA).pathname)).status).toBe(200);
  });

  it("deleting one account leaves the other user's data intact", async () => {
    const { a, b } = await twoUsers();
    await a.post("/api/tasks").send({ title: "A task", estimate: 1 }).expect(201);
    await b.post("/api/tasks").send({ title: "B task", estimate: 1 }).expect(201);
    await a.delete("/api/auth/me").expect(204);
    expect((await b.get("/api/state")).body.tasks.map((t: { title: string }) => t.title)).toEqual(["B task"]);
  });
});
