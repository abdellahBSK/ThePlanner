import { buildIcs, buildPlan, buildTimeline, nowIn, type CalendarEvent, type Habit, type Project, type Task, type TimelineItem } from "@theplanner/core";
import type { User } from "./repo";

export interface ScheduledItem extends TimelineItem {
  date: string;
  title: string;
  project: string | null;
  due: string | null;
}

/** Concrete time slots for the next `days` days, the same plan the web app shows. */
export function scheduleFor(user: User, data: { tasks: Task[]; habits: Habit[]; projects: Project[] }, days: number, at = new Date()): ScheduledItem[] {
  const { date: today } = nowIn(user.settings.timezone, at);
  const plan = buildPlan(data.tasks, data.habits, user.settings, today, Math.max(days, 42));
  const tasks = new Map(data.tasks.map(t => [t.id, t]));
  const habits = new Map(data.habits.map(h => [h.id, h]));
  const projects = new Map(data.projects.map(p => [p.id, p.name]));
  const out: ScheduledItem[] = [];
  for (const day of plan.days.slice(0, days)) {
    for (const item of buildTimeline(day, data.habits, user.settings)) {
      const task = item.kind === "task" ? tasks.get(item.id) : undefined;
      const habit = item.kind === "habit" ? habits.get(item.id) : undefined;
      out.push({
        ...item,
        date: day.date,
        title: task?.title ?? habit?.title ?? "",
        project: task?.projectId ? projects.get(task.projectId) ?? null : habit ? "Habit" : null,
        due: task?.due ?? null,
      });
    }
  }
  return out;
}

export function calendarFeed(user: User, data: { tasks: Task[]; habits: Habit[]; projects: Project[] }, publicUrl: string): string {
  const events: CalendarEvent[] = scheduleFor(user, data, 14).map(item => ({
    uid: `${item.date}-${item.kind}-${item.id}@theplanner`,
    date: item.date,
    start: item.start,
    minutes: item.minutes,
    title: item.kind === "habit" ? `Practice: ${item.title}` : item.title,
    description: [item.project, item.due ? `Due ${item.due}` : null, `Open ThePlanner: ${publicUrl}`].filter(Boolean).join("\n"),
  }));
  return buildIcs(events, { name: `ThePlanner · ${user.name}`, timeZone: user.settings.timezone });
}
