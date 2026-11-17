import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db";
import { Repo } from "../src/repo";

const newPath = () => join(mkdtempSync(join(tmpdir(), "theplanner-db-")), "planner.db");

describe("database upgrades", () => {
  it("adds the repeat columns to an existing database without losing tasks", () => {
    const path = newPath();
    const first = openDb(path);
    const seed = new Repo(first);
    const user = seed.createUser({ email: "sara@example.com", name: "Sara", passwordHash: "x", timezone: "UTC" });
    const old = seed.createTask(user.id, {
      title: "Old task", projectId: null, estimate: 1, due: "2026-11-20", dueConfirmed: true, priority: 2, status: "todo",
      notBefore: null, notes: "keep me", link: "", repeat: null,
    });

    // Roll back to the schema before recurring tasks: drop the new columns and the version bump.
    first.exec("ALTER TABLE tasks DROP COLUMN repeat_unit; ALTER TABLE tasks DROP COLUMN repeat_interval; ALTER TABLE tasks DROP COLUMN next_id;");
    first.exec("UPDATE schema_version SET version = version - 1");
    first.close();

    const upgraded = openDb(path);
    const columns = (upgraded.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(c => c.name);
    expect(columns).toEqual(expect.arrayContaining(["repeat_unit", "repeat_interval", "next_id"]));

    const repo = new Repo(upgraded);
    expect(repo.getTask(user.id, old.id)).toMatchObject({ title: "Old task", notes: "keep me", repeat: null, nextId: null });

    const repeating = repo.createTask(user.id, {
      title: "Weekly", projectId: null, estimate: 1, due: "2026-11-20", dueConfirmed: true, priority: 2, status: "todo",
      notBefore: null, notes: "", link: "", repeat: { unit: "week", interval: 1 },
    });
    repo.updateTask(user.id, repeating.id, { status: "done" });
    expect(repo.state(user.id).tasks).toHaveLength(3);
    upgraded.close();
  });

  it("does not rerun the migration when an upgraded database is opened again", () => {
    const path = newPath();
    const readVersion = (db: ReturnType<typeof openDb>) => (db.prepare("SELECT version FROM schema_version").get() as { version: number }).version;
    const first = openDb(path);
    const version = readVersion(first);
    first.close();
    expect(() => openDb(path).close()).not.toThrow();
    const again = openDb(path);
    expect(readVersion(again)).toBe(version);
    again.close();
  });
});
