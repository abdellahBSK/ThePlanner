import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, type Habit, type Project, type Settings, type Task, type WorkLog } from "@theplanner/core";
import type { Db } from "./db";

export interface User {
  id: string;
  email: string;
  name: string;
  settings: Settings;
  calendarToken: string;
  createdAt: string;
}

type Row = Record<string, any>;
const now = () => new Date().toISOString();

function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    settings: { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings) },
    calendarToken: row.calendar_token,
    createdAt: row.created_at,
  };
}

function toTask(row: Row, log: WorkLog): Task {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    estimate: row.estimate,
    due: row.due,
    dueConfirmed: !!row.due_confirmed,
    priority: row.priority,
    status: row.status,
    notBefore: row.not_before,
    notes: row.notes,
    link: row.link,
    log,
    createdAt: row.created_at,
    doneAt: row.done_at,
  };
}

function toHabit(row: Row, log: WorkLog): Habit {
  return { id: row.id, title: row.title, minutes: row.minutes, days: JSON.parse(row.days), link: row.link, active: !!row.active, log };
}

export const newCalendarToken = () => randomBytes(24).toString("base64url");

export class Repo {
  constructor(private db: Db) {}

  // ---------- users ----------
  createUser(input: { email: string; name: string; passwordHash: string; timezone: string }): User {
    const id = randomUUID();
    const settings: Settings = { ...DEFAULT_SETTINGS, timezone: input.timezone };
    this.db
      .prepare("INSERT INTO users (id, email, name, password_hash, settings, calendar_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.email, input.name, input.passwordHash, JSON.stringify(settings), newCalendarToken(), now());
    return this.getUser(id)!;
  }

  getUser(id: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row ? toUser(row) : null;
  }

  findUserForLogin(email: string): { user: User; passwordHash: string } | null {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Row | undefined;
    return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
  }

  emailTaken(email: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  }

  findUserByCalendarToken(token: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE calendar_token = ?").get(token) as Row | undefined;
    return row ? toUser(row) : null;
  }

  updateUser(id: string, patch: { name?: string; settings?: Settings; calendarToken?: string; passwordHash?: string }): User {
    if (patch.name !== undefined) this.db.prepare("UPDATE users SET name = ? WHERE id = ?").run(patch.name, id);
    if (patch.settings !== undefined) this.db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(patch.settings), id);
    if (patch.calendarToken !== undefined) this.db.prepare("UPDATE users SET calendar_token = ? WHERE id = ?").run(patch.calendarToken, id);
    if (patch.passwordHash !== undefined) this.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(patch.passwordHash, id);
    return this.getUser(id)!;
  }

  deleteUser(id: string): void {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  listUserIdsWithPush(): string[] {
    return (this.db.prepare("SELECT DISTINCT user_id FROM push_subscriptions").all() as Row[]).map(r => r.user_id);
  }

  // ---------- logs ----------
  private logsFor(userId: string): Map<string, WorkLog> {
    const map = new Map<string, WorkLog>();
    for (const row of this.db.prepare("SELECT item_id, date, hours FROM logs WHERE user_id = ?").all(userId) as Row[]) {
      if (!map.has(row.item_id)) map.set(row.item_id, {});
      map.get(row.item_id)![row.date] = row.hours;
    }
    return map;
  }

  setLog(userId: string, itemId: string, date: string, hours: number): void {
    if (hours <= 0) {
      this.db.prepare("DELETE FROM logs WHERE user_id = ? AND item_id = ? AND date = ?").run(userId, itemId, date);
    } else {
      this.db
        .prepare("INSERT INTO logs (user_id, item_id, date, hours) VALUES (?, ?, ?, ?) ON CONFLICT(item_id, date) DO UPDATE SET hours = excluded.hours")
        .run(userId, itemId, date, hours);
    }
  }

  ownsItem(userId: string, itemId: string): boolean {
    return !!(
      this.db.prepare("SELECT 1 FROM tasks WHERE id = ? AND user_id = ?").get(itemId, userId) ||
      this.db.prepare("SELECT 1 FROM habits WHERE id = ? AND user_id = ?").get(itemId, userId)
    );
  }

  // ---------- state ----------
  state(userId: string): { projects: Project[]; tasks: Task[]; habits: Habit[] } {
    const logs = this.logsFor(userId);
    const projects = (this.db.prepare("SELECT id, name, color FROM projects WHERE user_id = ? ORDER BY created_at").all(userId) as Row[])
      .map(r => ({ id: r.id, name: r.name, color: r.color }));
    const tasks = (this.db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at").all(userId) as Row[])
      .map(r => toTask(r, logs.get(r.id) ?? {}));
    const habits = (this.db.prepare("SELECT * FROM habits WHERE user_id = ? ORDER BY created_at").all(userId) as Row[])
      .map(r => toHabit(r, logs.get(r.id) ?? {}));
    return { projects, tasks, habits };
  }

  // ---------- projects ----------
  createProject(userId: string, input: { name: string; color: string }): Project {
    const id = randomUUID();
    this.db.prepare("INSERT INTO projects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, input.name, input.color, now());
    return { id, ...input };
  }

  findProjectByName(userId: string, name: string): Project | null {
    const r = this.db.prepare("SELECT id, name, color FROM projects WHERE user_id = ? AND name = ? COLLATE NOCASE").get(userId, name) as Row | undefined;
    return r ? { id: r.id, name: r.name, color: r.color } : null;
  }

  updateProject(userId: string, id: string, patch: Partial<{ name: string; color: string }>): Project | null {
    const current = this.db.prepare("SELECT id, name, color FROM projects WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
    if (!current) return null;
    const next = { id, name: patch.name ?? current.name, color: patch.color ?? current.color };
    this.db.prepare("UPDATE projects SET name = ?, color = ? WHERE id = ?").run(next.name, next.color, id);
    return next;
  }

  deleteProject(userId: string, id: string): boolean {
    return this.db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  }

  projectBelongsTo(userId: string, id: string | null | undefined): boolean {
    if (!id) return true;
    return !!this.db.prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ?").get(id, userId);
  }

  // ---------- tasks ----------
  createTask(userId: string, input: Omit<Task, "id" | "log" | "createdAt" | "doneAt">): Task {
    const id = randomUUID();
    this.db
      .prepare(`INSERT INTO tasks (id, user_id, project_id, title, estimate, due, due_confirmed, priority, status, not_before, notes, link, created_at, done_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, input.projectId, input.title, input.estimate, input.due, input.dueConfirmed ? 1 : 0, input.priority, input.status,
        input.notBefore, input.notes, input.link, now(), input.status === "done" ? now() : null);
    return this.getTask(userId, id)!;
  }

  getTask(userId: string, id: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
    if (!row) return null;
    const log: WorkLog = {};
    for (const l of this.db.prepare("SELECT date, hours FROM logs WHERE item_id = ?").all(id) as Row[]) log[l.date] = l.hours;
    return toTask(row, log);
  }

  updateTask(userId: string, id: string, patch: Partial<Omit<Task, "id" | "log" | "createdAt" | "doneAt">>): Task | null {
    const current = this.getTask(userId, id);
    if (!current) return null;
    const next = { ...current, ...patch };
    const doneAt = next.status === "done" ? current.doneAt ?? now() : null;
    this.db
      .prepare(`UPDATE tasks SET project_id = ?, title = ?, estimate = ?, due = ?, due_confirmed = ?, priority = ?, status = ?, not_before = ?, notes = ?, link = ?, done_at = ?
                WHERE id = ? AND user_id = ?`)
      .run(next.projectId, next.title, next.estimate, next.due, next.dueConfirmed ? 1 : 0, next.priority, next.status, next.notBefore,
        next.notes, next.link, doneAt, id, userId);
    return this.getTask(userId, id);
  }

  deleteTask(userId: string, id: string): boolean {
    const deleted = this.db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
    if (deleted) this.db.prepare("DELETE FROM logs WHERE item_id = ?").run(id);
    return deleted;
  }

  // ---------- habits ----------
  createHabit(userId: string, input: Omit<Habit, "id" | "log">): Habit {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO habits (id, user_id, title, minutes, days, link, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, userId, input.title, input.minutes, JSON.stringify(input.days), input.link, input.active ? 1 : 0, now());
    return this.getHabit(userId, id)!;
  }

  getHabit(userId: string, id: string): Habit | null {
    const row = this.db.prepare("SELECT * FROM habits WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
    if (!row) return null;
    const log: WorkLog = {};
    for (const l of this.db.prepare("SELECT date, hours FROM logs WHERE item_id = ?").all(id) as Row[]) log[l.date] = l.hours;
    return toHabit(row, log);
  }

  updateHabit(userId: string, id: string, patch: Partial<Omit<Habit, "id" | "log">>): Habit | null {
    const current = this.getHabit(userId, id);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db
      .prepare("UPDATE habits SET title = ?, minutes = ?, days = ?, link = ?, active = ? WHERE id = ? AND user_id = ?")
      .run(next.title, next.minutes, JSON.stringify(next.days), next.link, next.active ? 1 : 0, id, userId);
    return this.getHabit(userId, id);
  }

  deleteHabit(userId: string, id: string): boolean {
    const deleted = this.db.prepare("DELETE FROM habits WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
    if (deleted) this.db.prepare("DELETE FROM logs WHERE item_id = ?").run(id);
    return deleted;
  }

  // ---------- push ----------
  savePushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): void {
    this.db
      .prepare(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(sub.endpoint, userId, sub.p256dh, sub.auth, now());
  }

  deletePushSubscription(endpoint: string, userId?: string): void {
    if (userId) this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(endpoint, userId);
    else this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  pushSubscriptions(userId: string): Array<{ endpoint: string; p256dh: string; auth: string }> {
    return this.db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as any;
  }

  /** Records a reminder as sent; false if it had already been sent. */
  markReminderSent(userId: string, key: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO sent_reminders (user_id, key, sent_at) VALUES (?, ?, ?)").run(userId, key, now()).changes > 0;
  }

  pruneReminders(olderThanIso: string): void {
    this.db.prepare("DELETE FROM sent_reminders WHERE sent_at < ?").run(olderThanIso);
  }
}
