import { existsSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { DEFAULT_SETTINGS, isValidTimeZone, type Settings } from "@theplanner/core";
import type { Config } from "./config";
import type { Db } from "./db";
import { loadDemo } from "./demo";
import { calendarFeed } from "./plan";
import { newCalendarToken, Repo, type User } from "./repo";
import { sendToUser } from "./push";

const COOKIE = "tp_session";
const SESSION_DAYS = 30;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- validation ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-07");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #4f7cff");
const timezone = z.string().refine(isValidTimeZone, "Unknown time zone");

const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: timezone.optional(),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

const taskFields = {
  title: z.string().trim().min(1, "Give the task a title").max(300),
  projectId: z.string().nullable(),
  estimate: z.number().min(0.25, "Estimate at least 15 minutes").max(500),
  due: isoDate.nullable(),
  dueConfirmed: z.boolean(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(["todo", "waiting", "done"]),
  notBefore: isoDate.nullable(),
  notes: z.string().max(5000),
  link: z.string().max(2000),
};
const taskCreate = z.object({
  ...taskFields,
  projectId: taskFields.projectId.default(null),
  due: taskFields.due.default(null),
  dueConfirmed: taskFields.dueConfirmed.default(true),
  priority: taskFields.priority.default(2),
  status: taskFields.status.default("todo"),
  notBefore: taskFields.notBefore.default(null),
  notes: taskFields.notes.default(""),
  link: taskFields.link.default(""),
  /** Create the project by name if it doesn't exist (used by quick add). */
  projectName: z.string().trim().min(1).max(80).optional(),
});
const taskPatch = z.object(taskFields).partial();

const habitFields = {
  title: z.string().trim().min(1, "Give the habit a title").max(200),
  minutes: z.number().int().min(5).max(600),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  link: z.string().max(2000),
  active: z.boolean(),
};
const habitCreate = z.object({ ...habitFields, link: habitFields.link.default(""), active: habitFields.active.default(true) });
const habitPatch = z.object(habitFields).partial();

const projectCreate = z.object({ name: z.string().trim().min(1, "Name the project").max(80), color });
const projectPatch = projectCreate.partial();

const settingsPatch = z.object({
  weekdayHours: z.array(z.number().min(0).max(24)).length(7),
  dayStart: z.array(hhmm).length(7),
  overrides: z.record(isoDate, z.number().min(0).max(24)),
  maxPerTaskPerDay: z.number().min(0.25).max(24),
  breakMinutes: z.number().int().min(0).max(120),
  morningTime: hhmm,
  remindBeforeMinutes: z.number().int().min(0).max(120),
  timezone,
}).partial();

const logPut = z.object({ itemId: z.string(), date: isoDate, hours: z.number().min(0).max(24) });
const pushSub = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(500), auth: z.string().max(500) }) });

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, settings: u.settings, createdAt: u.createdAt });

export function createApp(db: Db, config: Config) {
  const repo = new Repo(db);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  // Mutating API calls must be JSON; browsers can't send that cross-site without CORS, which blocks CSRF.
  app.use("/api", (req, _res, next) => {
    const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && hasBody && !req.is("application/json")) {
      return next(new HttpError(415, "Send the request body as JSON."));
    }
    next();
  });

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts. Try again in a few minutes." } });

  function startSession(res: Response, user: User) {
    const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.secureCookies, maxAge: SESSION_DAYS * 86_400_000, path: "/" });
  }

  function requireUser(req: Request, _res: Response, next: NextFunction) {
    const token = req.cookies?.[COOKIE];
    if (!token) return next(new HttpError(401, "Sign in to continue"));
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
      const user = repo.getUser(payload.sub);
      if (!user) return next(new HttpError(401, "Sign in to continue"));
      (req as any).user = user;
      next();
    } catch {
      next(new HttpError(401, "Your session has expired. Sign in again."));
    }
  }
  const userOf = (req: Request) => (req as any).user as User;

  // ---------- public ----------
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/auth/signup", authLimiter, async (req, res) => {
    const input = parse(signupSchema, req.body);
    if (repo.emailTaken(input.email)) throw new HttpError(409, "An account with this email already exists. Sign in instead.");
    const user = repo.createUser({
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 11),
      timezone: input.timezone ?? DEFAULT_SETTINGS.timezone,
    });
    startSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const found = repo.findUserForLogin(input.email);
    const ok = found ? await bcrypt.compare(input.password, found.passwordHash) : await bcrypt.compare(input.password, "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    if (!found || !ok) throw new HttpError(401, "Email or password is incorrect.");
    startSession(res, found.user);
    res.json({ user: publicUser(found.user) });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(COOKIE, { path: "/" });
    res.status(204).end();
  });

  app.get("/cal/:token.ics", (req, res) => {
    const user = repo.findUserByCalendarToken(req.params.token);
    if (!user) throw new HttpError(404, "Calendar not found");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(calendarFeed(user, repo.state(user.id), config.publicUrl));
  });

  // ---------- signed in ----------
  const api = express.Router();
  api.use(requireUser);

  api.get("/auth/me", (req, res) => res.json({ user: publicUser(userOf(req)) }));

  api.patch("/auth/me", async (req, res) => {
    const input = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), currentPassword: z.string().optional(), newPassword: z.string().min(8, "Use at least 8 characters").max(200).optional() }), req.body);
    const user = userOf(req);
    let passwordHash: string | undefined;
    if (input.newPassword) {
      const found = repo.findUserForLogin(user.email)!;
      if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, found.passwordHash))) throw new HttpError(400, "Your current password is incorrect.");
      passwordHash = await bcrypt.hash(input.newPassword, 11);
    }
    res.json({ user: publicUser(repo.updateUser(user.id, { name: input.name, passwordHash })) });
  });

  api.delete("/auth/me", (req, res) => {
    repo.deleteUser(userOf(req).id);
    res.clearCookie(COOKIE, { path: "/" });
    res.status(204).end();
  });

  api.get("/state", (req, res) => {
    const user = userOf(req);
    res.json({ user: publicUser(user), ...repo.state(user.id) });
  });

  api.patch("/settings", (req, res) => {
    const user = userOf(req);
    const patch = parse(settingsPatch, req.body);
    const settings: Settings = { ...user.settings, ...patch };
    res.json({ settings: repo.updateUser(user.id, { settings }).settings });
  });

  api.post("/demo", (req, res) => {
    loadDemo(db, repo, userOf(req));
    res.json(repo.state(userOf(req).id));
  });

  // projects
  api.post("/projects", (req, res) => res.status(201).json(repo.createProject(userOf(req).id, parse(projectCreate, req.body))));
  api.patch("/projects/:id", (req, res) => {
    const project = repo.updateProject(userOf(req).id, req.params.id, parse(projectPatch, req.body));
    if (!project) throw new HttpError(404, "Project not found");
    res.json(project);
  });
  api.delete("/projects/:id", (req, res) => {
    if (!repo.deleteProject(userOf(req).id, req.params.id)) throw new HttpError(404, "Project not found");
    res.status(204).end();
  });

  // tasks
  const palette = ["#4f7cff", "#8b5cf6", "#ef4f6b", "#f59e0b", "#84cc16", "#b45309", "#ec4899", "#0ea5e9"];
  api.post("/tasks", (req, res) => {
    const user = userOf(req);
    const { projectName, ...input } = parse(taskCreate, req.body);
    if (projectName) {
      const count = repo.state(user.id).projects.length;
      input.projectId = (repo.findProjectByName(user.id, projectName) ?? repo.createProject(user.id, { name: projectName, color: palette[count % palette.length] })).id;
    }
    if (!repo.projectBelongsTo(user.id, input.projectId)) throw new HttpError(400, "Project not found");
    res.status(201).json(repo.createTask(user.id, input));
  });
  api.patch("/tasks/:id", (req, res) => {
    const user = userOf(req);
    const patch = parse(taskPatch, req.body);
    if (!repo.projectBelongsTo(user.id, patch.projectId)) throw new HttpError(400, "Project not found");
    const task = repo.updateTask(user.id, req.params.id, patch);
    if (!task) throw new HttpError(404, "Task not found");
    res.json(task);
  });
  api.delete("/tasks/:id", (req, res) => {
    if (!repo.deleteTask(userOf(req).id, req.params.id)) throw new HttpError(404, "Task not found");
    res.status(204).end();
  });

  // habits
  api.post("/habits", (req, res) => res.status(201).json(repo.createHabit(userOf(req).id, parse(habitCreate, req.body))));
  api.patch("/habits/:id", (req, res) => {
    const habit = repo.updateHabit(userOf(req).id, req.params.id, parse(habitPatch, req.body));
    if (!habit) throw new HttpError(404, "Habit not found");
    res.json(habit);
  });
  api.delete("/habits/:id", (req, res) => {
    if (!repo.deleteHabit(userOf(req).id, req.params.id)) throw new HttpError(404, "Habit not found");
    res.status(204).end();
  });

  // logs
  api.put("/logs", (req, res) => {
    const user = userOf(req);
    const input = parse(logPut, req.body);
    if (!repo.ownsItem(user.id, input.itemId)) throw new HttpError(404, "Task or habit not found");
    repo.setLog(user.id, input.itemId, input.date, Math.round(input.hours * 100) / 100);
    res.status(204).end();
  });

  // calendar feed
  api.get("/calendar", (req, res) => res.json({ url: `${config.publicUrl}/cal/${userOf(req).calendarToken}.ics` }));
  api.post("/calendar/rotate", (req, res) => {
    const user = repo.updateUser(userOf(req).id, { calendarToken: newCalendarToken() });
    res.json({ url: `${config.publicUrl}/cal/${user.calendarToken}.ics` });
  });

  // push notifications
  api.get("/push/key", (_req, res) => res.json({ publicKey: config.vapid.publicKey }));
  api.post("/push/subscribe", (req, res) => {
    const sub = parse(pushSub, req.body);
    repo.savePushSubscription(userOf(req).id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
    res.status(204).end();
  });
  api.post("/push/unsubscribe", (req, res) => {
    const { endpoint } = parse(z.object({ endpoint: z.string() }), req.body);
    repo.deletePushSubscription(endpoint, userOf(req).id);
    res.status(204).end();
  });
  api.post("/push/test", async (req, res) => {
    const sent = await sendToUser(repo, config, userOf(req).id, { title: "Notifications are on", body: "You'll get your morning plan and a reminder before each block.", url: "/" });
    if (!sent) throw new HttpError(400, "No device is subscribed yet. Turn notifications on first.");
    res.json({ sent });
  });

  app.use("/api", api);

  // ---------- web app ----------
  if (config.webDist && existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: "1h", setHeaders: (res, path) => { if (path.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api\/|cal\/).*/, (_req, res) => res.sendFile(join(config.webDist!, "index.html")));
  }

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError && "body" in (err as any)) return res.status(400).json({ error: "The request body isn't valid JSON." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return { app, repo };
}
