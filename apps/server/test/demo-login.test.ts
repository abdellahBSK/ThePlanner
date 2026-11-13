import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";

const tmp = () => mkdtempSync(join(tmpdir(), "theplanner-"));
const on = { PLANNER_DEV_DEMO: "1" };

function setup(env: NodeJS.ProcessEnv = on) {
  const config = loadConfig({ DATA_DIR: tmp(), PORT: "3999", ...env });
  return { ...createApp(openDb(":memory:"), config), config };
}

describe("devDemo flag", () => {
  it("is on only when all three conditions hold", () => {
    expect(loadConfig({ DATA_DIR: tmp(), ...on }).devDemo).toBe(true);
    expect(loadConfig({ DATA_DIR: tmp(), PUBLIC_URL: "http://127.0.0.1:3000", ...on }).devDemo).toBe(true);
  });
  it("is off without PLANNER_DEV_DEMO=1", () => {
    expect(loadConfig({ DATA_DIR: tmp() }).devDemo).toBe(false);
    expect(loadConfig({ DATA_DIR: tmp(), PLANNER_DEV_DEMO: "true" }).devDemo).toBe(false);
  });
  it("is off in production", () => {
    expect(loadConfig({ DATA_DIR: tmp(), NODE_ENV: "production", ...on }).devDemo).toBe(false);
  });
  it("is off for a non-local public URL", () => {
    expect(loadConfig({ DATA_DIR: tmp(), PUBLIC_URL: "https://planner.example.com", ...on }).devDemo).toBe(false);
    expect(loadConfig({ DATA_DIR: tmp(), PUBLIC_URL: "http://localhost.evil.com", ...on }).devDemo).toBe(false);
  });
});

describe("GET /api/dev/demo-login", () => {
  it("returns the normal 404 when the flag is off", async () => {
    const { app } = setup({});
    const agent = request.agent(app);
    await agent.post("/api/auth/signup").send({ name: "Sara", email: "sara@example.com", password: "correct horse" });
    const res = await agent.get("/api/dev/demo-login?next=/week");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
    expect((await agent.get("/api/state")).body.tasks).toHaveLength(0);
  });

  it("signs in, sets a cookie, redirects and loads demo tasks once", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    const res = await agent.get("/api/dev/demo-login?next=/week&tz=Africa/Casablanca");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/week");
    expect(res.headers["set-cookie"]?.[0]).toContain("tp_session=");
    const state = await agent.get("/api/state");
    expect(state.status).toBe(200);
    const count = state.body.tasks.length;
    expect(count).toBeGreaterThan(0);
    const me = await agent.get("/api/auth/me");
    expect(me.body.user).toMatchObject({ name: "Demo", email: "demo@theplanner.local" });
    expect(me.body.user.settings.timezone).toBe("Africa/Casablanca");

    await agent.get("/api/dev/demo-login");
    expect((await agent.get("/api/state")).body.tasks).toHaveLength(count);
  });

  it("falls back to UTC for an invalid time zone", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.get("/api/dev/demo-login?tz=Not/AZone");
    expect((await agent.get("/api/auth/me")).body.user.settings.timezone).toBe("UTC");
  });

  it("cannot be signed in to with a password", async () => {
    const { app } = setup();
    await request(app).get("/api/dev/demo-login");
    for (const password of ["demo", "password", "demo1234"]) {
      const res = await request(app).post("/api/auth/login").send({ email: "demo@theplanner.local", password });
      expect(res.status).toBe(401);
    }
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil", ""])("redirects unsafe next %j to /", async next => {
    const { app } = setup();
    const res = await request(app).get("/api/dev/demo-login").query({ next });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });

  it.each([
    "/%2F%2Fevil.com", // decodes to //evil.com
    "/%5Cevil.com", // decodes to /\evil.com
    "%2F%2Fevil.com",
    "/%09/evil.com", // "/" + tab + "/evil.com": browsers strip the tab, leaving //evil.com
    "/%0A/evil.com", // "/" + newline + "/evil.com"
    "/%0D/evil.com",
    "%09//evil.com", // leading tab: not a path starting with "/"
    "%0A/evil.com",
    " //evil.com",
  ])("never redirects off-site for encoded or whitespace-prefixed next %j", async next => {
    const { app } = setup();
    const res = await request(app).get(`/api/dev/demo-login?next=${next}`);
    expect(res.status).toBe(302);
    // Resolve the way a browser would: the target must stay on the same origin.
    expect(new URL(res.headers.location, "http://planner.test").origin).toBe("http://planner.test");
  });

  it("redirects to / when next is absent", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/dev/demo-login");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });

  it("falls back to UTC when tz is absent", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.get("/api/dev/demo-login");
    expect((await agent.get("/api/auth/me")).body.user.settings.timezone).toBe("UTC");
  });

  it("returns 401 without a session cookie when the flag is off, never a redirect", async () => {
    const { app } = setup({});
    const res = await request(app).get("/api/dev/demo-login?next=/week");
    expect(res.status).toBe(401);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
