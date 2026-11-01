import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildPlan, nowIn, type Habit, type Plan, type Settings, type Task } from "@theplanner/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type AppState, type TaskInput } from "./api";
import { useToast } from "../components/Toast";

export const STATE_KEY = ["state"];

/** The current local date and minute in the user's time zone, refreshed every 30 seconds. */
export function useClock(timeZone: string) {
  const [now, setNow] = useState(() => nowIn(timeZone));
  useEffect(() => {
    setNow(nowIn(timeZone));
    const t = setInterval(() => setNow(nowIn(timeZone)), 30_000);
    return () => clearInterval(t);
  }, [timeZone]);
  return now;
}

interface Planner {
  state: AppState;
  today: string;
  minutes: number;
  plan: Plan;
  taskById: Map<string, Task>;
  habitById: Map<string, Habit>;
  projectName: (id: string | null) => string;
  projectColor: (id: string | null) => string;
  actions: ReturnType<typeof useActions>;
}

const PlannerContext = createContext<Planner | null>(null);

export function usePlanner(): Planner {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used inside PlannerProvider");
  return ctx;
}

function useActions() {
  const qc = useQueryClient();
  const toast = useToast();

  /** Applies a change locally first, then sends it; on failure, reloads and shows the error. */
  const run = useCallback(
    async <T,>(optimistic: ((s: AppState) => AppState) | null, request: () => Promise<T>, done?: string): Promise<T | undefined> => {
      if (optimistic) qc.setQueryData<AppState>(STATE_KEY, s => (s ? optimistic(s) : s));
      try {
        const result = await request();
        await qc.invalidateQueries({ queryKey: STATE_KEY });
        if (done) toast(done);
        return result;
      } catch (error) {
        await qc.invalidateQueries({ queryKey: STATE_KEY });
        toast(error instanceof ApiError ? error.message : "Couldn't save. Try again.", "error");
        return undefined;
      }
    },
    [qc, toast],
  );

  return useMemo(() => ({
    setLog: (itemId: string, date: string, hours: number) =>
      run(
        s => {
          const apply = <X extends Task | Habit>(x: X): X => {
            if (x.id !== itemId) return x;
            const log = { ...x.log };
            if (hours > 0) log[date] = hours; else delete log[date];
            return { ...x, log };
          };
          return { ...s, tasks: s.tasks.map(apply), habits: s.habits.map(apply) };
        },
        () => api.setLog(itemId, date, hours),
      ),
    createTask: (input: TaskInput, message = "Task added") => run(null, () => api.createTask(input), message),
    updateTask: (id: string, patch: TaskInput, message?: string) =>
      run(s => ({ ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, ...patch } as Task : t)) }), () => api.updateTask(id, patch), message),
    deleteTask: (id: string) => run(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }), () => api.deleteTask(id), "Task deleted"),
    createHabit: (input: Partial<Habit>) => run(null, () => api.createHabit(input), "Habit added"),
    updateHabit: (id: string, patch: Partial<Habit>) =>
      run(s => ({ ...s, habits: s.habits.map(h => (h.id === id ? { ...h, ...patch } : h)) }), () => api.updateHabit(id, patch)),
    deleteHabit: (id: string) => run(s => ({ ...s, habits: s.habits.filter(h => h.id !== id) }), () => api.deleteHabit(id), "Habit deleted"),
    createProject: (name: string, color: string) => run(null, () => api.createProject({ name, color }), "Project created"),
    updateProject: (id: string, patch: { name?: string; color?: string }) =>
      run(s => ({ ...s, projects: s.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) }), () => api.updateProject(id, patch)),
    deleteProject: (id: string) =>
      run(s => ({ ...s, projects: s.projects.filter(p => p.id !== id), tasks: s.tasks.map(t => (t.projectId === id ? { ...t, projectId: null } : t)) }),
        () => api.deleteProject(id), "Project deleted. Its tasks are kept."),
    updateSettings: (patch: Partial<Settings>, message?: string) =>
      run(s => ({ ...s, user: { ...s.user, settings: { ...s.user.settings, ...patch } } }), () => api.updateSettings(patch), message),
    loadDemo: () => run(null, () => api.loadDemo(), "Example semester loaded"),
  }), [run]);
}

export function PlannerProvider({ state, children }: { state: AppState; children: ReactNode }) {
  const { date: today, minutes } = useClock(state.user.settings.timezone);
  const actions = useActions();
  const value = useMemo<Planner>(() => {
    const plan = buildPlan(state.tasks, state.habits, state.user.settings, today, 42);
    const projects = new Map(state.projects.map(p => [p.id, p]));
    return {
      state, today, minutes, plan, actions,
      taskById: new Map(state.tasks.map(t => [t.id, t])),
      habitById: new Map(state.habits.map(h => [h.id, h])),
      projectName: id => (id && projects.get(id)?.name) || "No project",
      projectColor: id => (id && projects.get(id)?.color) || "var(--muted)",
    };
  }, [state, today, minutes, actions]);
  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function useAppState() {
  return useQuery({ queryKey: STATE_KEY, queryFn: api.state, retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2 });
}
