import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { nowIn } from "@theplanner/core";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { dueReminders } from "../src/reminders";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "theplanner-"));
  const config = loadConfig({ DATA_DIR: dir, PORT: "3999" });
  const db = openDb(":memory:");
  return { ...createApp(db, config), config };
}

async function signedIn(app: ReturnType<typeof setup>["app"], email = "sara@example.com") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/signup").send({ name: "Sara", email, password: "correct horse", timezone: "Africa/Casablanca" });
  expect(res.status).toBe(201);
  return agent;
}

describe("accounts", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it("signs up, reads the session and signs out", async () => {
    const agent = await signedIn(ctx.app);
    const me = await agent.get("/api/auth/me");
    expect(me.body.user).toMatchObject({ name: "Sara", email: "sara@example.com" });
    expect(me.body.user.settings.timezone).toBe("Africa/Casablanca");
    expect(me.body.user.passwordHash).toBeUndefined();
    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects a duplicate email, a short password and a wrong password", async () => {
    await signedIn(ctx.app);
    const dup = await request(ctx.app).post("/api/auth/signup").send({ name: "X", email: "SARA@example.com", password: "12345678" });
    expect(dup.status).toBe(409);
    const short = await request(ctx.app).post("/api/auth/signup").send({ name: "X", email: "x@example.com", password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/8 characters/);
    const wrong = await request(ctx.app).post("/api/auth/login").send({ email: "sara@example.com", password: "nope nope" });
    expect(wrong.status).toBe(401);
    const right = await request(ctx.app).post("/api/auth/login").send({ email: "Sara@Example.com", password: "correct horse" });
    expect(right.status).toBe(200);
  });

  it("requires a session for the API", async () => {
    expect((await request(ctx.app).get("/api/state")).status).toBe(401);
  });
});

describe("planner data", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(); });

  it("creates, updates, logs and deletes tasks", async () => {
    const agent = await signedIn(ctx.app);
    const created = await agent.post("/api/tasks").send({ title: "Lab report", estimate: 3, due: "2026-11-20", projectName: "Cyber Security" });
    expect(created.status).toBe(201);
    expect(created.body.projectId).toBeTruthy();

    const id = created.body.id;
    await agent.put("/api/logs").send({ itemId: id, date: "2026-11-02", hours: 1.5 }).expect(204);
    const patched = await agent.patch(`/api/tasks/${id}`).send({ status: "done" });
    expect(patched.body).toMatchObject({ status: "done", log: { "2026-11-02": 1.5 } });
    expect(patched.body.doneAt).toBeTruthy();

    const state = await agent.get("/api/state");
    expect(state.body.projects).toHaveLength(1);
    expect(state.body.projects[0].name).toBe("Cyber Security");

    await agent.delete(`/api/tasks/${id}`).expect(204);
    expect((await agent.get("/api/state")).body.tasks).toHaveLength(0);
  });

  it("keeps each user's data private", async () => {
    const sara = await signedIn(ctx.app, "sara@example.com");
    const omar = await signedIn(ctx.app, "omar@example.com");
    const task = (await sara.post("/api/tasks").send({ title: "Secret", estimate: 1 })).body;
    expect((await omar.get("/api/state")).body.tasks).toHaveLength(0);
    expect((await omar.patch(`/api/tasks/${task.id}`).send({ title: "Mine now" })).status).toBe(404);
    expect((await omar.put("/api/logs").send({ itemId: task.id, date: "2026-11-02", hours: 1 })).status).toBe(404);
    expect((await omar.delete(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it("validates input with clear messages", async () => {
    const agent = await signedIn(ctx.app);
    const res = await agent.post("/api/tasks").send({ title: "", estimate: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Give the task a title");
    const bad = await agent.patch("/api/settings").send({ dayStart: ["25:00", "18:00", "18:00", "18:00", "18:00", "18:00", "10:00"] });
    expect(bad.status).toBe(400);
  });

  it("only accepts JSON bodies on the API", async () => {
    const agent = await signedIn(ctx.app);
    const res = await agent.post("/api/tasks").type("form").send("title=x&estimate=1");
    expect(res.status).toBe(415);
  });

  it("loads the example semester and updates settings", async () => {
    const agent = await signedIn(ctx.app);
    const demo = await agent.post("/api/demo");
    expect(demo.body.tasks.length).toBeGreaterThan(5);
    expect(demo.body.habits.length).toBe(2);
    const s = await agent.patch("/api/settings").send({ weekdayHours: [0, 2, 2, 2, 2, 2, 6], overrides: { "2026-11-03": 1 } });
    expect(s.body.settings.weekdayHours).toEqual([0, 2, 2, 2, 2, 2, 6]);
    expect(s.body.settings.overrides).toEqual({ "2026-11-03": 1 });
  });

  it("manages habits", async () => {
    const agent = await signedIn(ctx.app);
    const h = await agent.post("/api/habits").send({ title: "Read", minutes: 30, days: [1, 3, 5] });
    expect(h.status).toBe(201);
    const p = await agent.patch(`/api/habits/${h.body.id}`).send({ active: false });
    expect(p.body.active).toBe(false);
  });
});

describe("calendar feed and reminders", () => {
  it("serves a calendar feed by secret link and can rotate it", async () => {
    const ctx = setup();
    const agent = await signedIn(ctx.app);
    await agent.post("/api/tasks").send({ title: "Write report", estimate: 2, due: "2099-01-01" });
    const { url } = (await agent.get("/api/calendar")).body;
    const path = new URL(url).pathname;
    const feed = await request(ctx.app).get(path);
    expect(feed.status).toBe(200);
    expect(feed.headers["content-type"]).toMatch(/text\/calendar/);
    expect(feed.text).toContain("SUMMARY:Write report");

    const rotated = (await agent.post("/api/calendar/rotate")).body.url;
    expect(rotated).not.toBe(url);
    expect((await request(ctx.app).get(path)).status).toBe(404);
  });

  it("builds the morning plan and the heads-up before a block", async () => {
    const ctx = setup();
    const agent = await signedIn(ctx.app);
    await agent.patch("/api/settings").send({
      timezone: "UTC", weekdayHours: Array(7).fill(3), dayStart: Array(7).fill("18:00"), morningTime: "08:00", remindBeforeMinutes: 5,
    });
    await agent.post("/api/tasks").send({ title: "Lab report", estimate: 2, due: "2099-01-01" });
    const userId = (await agent.get("/api/auth/me")).body.user.id;
    const day = nowIn("UTC").date;

    const morning = dueReminders(ctx.repo, userId, new Date(`${day}T08:03:00Z`));
    expect(morning.map(r => r.key)).toEqual([`morning:${day}`]);
    expect(morning[0].message.title).toBe("Today: 2h planned");

    const before = dueReminders(ctx.repo, userId, new Date(`${day}T17:56:00Z`));
    expect(before).toHaveLength(1);
    expect(before[0].message.title).toBe("In 4 min: Lab report");

    expect(dueReminders(ctx.repo, userId, new Date(`${day}T12:00:00Z`))).toHaveLength(0);
    expect(ctx.repo.markReminderSent(userId, before[0].key)).toBe(true);
    expect(ctx.repo.markReminderSent(userId, before[0].key)).toBe(false);
  });
});
