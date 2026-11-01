import type { Habit, Project, Settings, Task } from "@theplanner/core";

export interface User {
  id: string;
  email: string;
  name: string;
  settings: Settings;
  createdAt: string;
}

export interface AppState {
  user: User;
  projects: Project[];
  tasks: Task[];
  habits: Habit[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach ThePlanner. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong. Try again.");
  return data as T;
}

export type TaskInput = Partial<Omit<Task, "id" | "log" | "createdAt" | "doneAt">> & { projectName?: string };

export const api = {
  me: () => call<{ user: User }>("GET", "/auth/me"),
  signup: (input: { name: string; email: string; password: string; timezone: string }) => call<{ user: User }>("POST", "/auth/signup", input),
  login: (input: { email: string; password: string }) => call<{ user: User }>("POST", "/auth/login", input),
  logout: () => call<void>("POST", "/auth/logout"),
  updateMe: (input: { name?: string; currentPassword?: string; newPassword?: string }) => call<{ user: User }>("PATCH", "/auth/me", input),
  deleteMe: () => call<void>("DELETE", "/auth/me"),

  state: () => call<AppState>("GET", "/state"),
  loadDemo: () => call<Omit<AppState, "user">>("POST", "/demo"),
  updateSettings: (patch: Partial<Settings>) => call<{ settings: Settings }>("PATCH", "/settings", patch),

  createProject: (input: { name: string; color: string }) => call<Project>("POST", "/projects", input),
  updateProject: (id: string, patch: Partial<{ name: string; color: string }>) => call<Project>("PATCH", `/projects/${id}`, patch),
  deleteProject: (id: string) => call<void>("DELETE", `/projects/${id}`),

  createTask: (input: TaskInput) => call<Task>("POST", "/tasks", input),
  updateTask: (id: string, patch: TaskInput) => call<Task>("PATCH", `/tasks/${id}`, patch),
  deleteTask: (id: string) => call<void>("DELETE", `/tasks/${id}`),

  createHabit: (input: Partial<Omit<Habit, "id" | "log">>) => call<Habit>("POST", "/habits", input),
  updateHabit: (id: string, patch: Partial<Omit<Habit, "id" | "log">>) => call<Habit>("PATCH", `/habits/${id}`, patch),
  deleteHabit: (id: string) => call<void>("DELETE", `/habits/${id}`),

  setLog: (itemId: string, date: string, hours: number) => call<void>("PUT", "/logs", { itemId, date, hours }),

  calendarUrl: () => call<{ url: string }>("GET", "/calendar"),
  rotateCalendar: () => call<{ url: string }>("POST", "/calendar/rotate"),

  pushKey: () => call<{ publicKey: string }>("GET", "/push/key"),
  pushSubscribe: (sub: PushSubscriptionJSON) => call<void>("POST", "/push/subscribe", sub),
  pushUnsubscribe: (endpoint: string) => call<void>("POST", "/push/unsubscribe", { endpoint }),
  pushTest: () => call<{ sent: number }>("POST", "/push/test"),
};
