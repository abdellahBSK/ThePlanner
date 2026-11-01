import { addDays, round2, weekday } from "./dates";
import type { DayPlan, Habit, IsoDate, Plan, Settings, Task } from "./types";

export function hoursAvailable(settings: Settings, date: IsoDate): number {
  const override = settings.overrides[date];
  if (typeof override === "number") return override;
  return settings.weekdayHours[weekday(date)] ?? 0;
}

export function habitsOn(habits: Habit[], date: IsoDate): Habit[] {
  const day = weekday(date);
  return habits.filter(h => h.active && h.days.includes(day));
}

function loggedBefore(task: Task, date: IsoDate): number {
  let sum = 0;
  for (const [d, hours] of Object.entries(task.log)) if (d < date) sum += hours;
  return sum;
}

export function loggedTotal(item: { log: Record<string, number> }): number {
  return round2(Object.values(item.log).reduce((a, b) => a + b, 0));
}

/** Hours of work left on a task at the start of `today`. Work logged today doesn't count yet,
 * so logging during the day never reshuffles today's plan. */
export function remainingAtStart(task: Task, today: IsoDate): number {
  return Math.max(0, round2(task.estimate - loggedBefore(task, today)));
}

/** Earliest deadline first; then higher priority; then the smaller task. */
export function compareTasks(a: Task, b: Task): number {
  const da = a.due ?? "9999-12-31";
  const db = b.due ?? "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.estimate - b.estimate;
}

/**
 * Fill each day's free hours with open tasks, earliest deadline first.
 * Habits are taken out of each day's hours before any task is placed.
 */
export function buildPlan(tasks: Task[], habits: Habit[], settings: Settings, today: IsoDate, horizon = 42): Plan {
  const queue = tasks
    .filter(t => t.status === "todo" && remainingAtStart(t, today) > 0)
    .sort(compareTasks);
  const remaining = new Map(queue.map(t => [t.id, remainingAtStart(t, today)]));
  const finish: Plan["finish"] = {};
  const days: DayPlan[] = [];
  const maxPer = Math.max(0.25, settings.maxPerTaskPerDay);

  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const capacity = hoursAvailable(settings, date);
    const habitHours = round2(habitsOn(habits, date).reduce((s, h) => s + h.minutes / 60, 0));
    let free = Math.max(0, round2(capacity - habitHours));
    const blocks: DayPlan["blocks"] = [];

    for (const task of queue) {
      if (free < 0.25) break;
      const left = remaining.get(task.id)!;
      if (left <= 0) continue;
      if (task.notBefore && task.notBefore > date) continue;
      let take = Math.min(left, free, maxPer);
      // Quarter-hour steps, except for the piece that finishes a task.
      if (take < left) take = Math.floor(take * 4) / 4;
      if (take <= 0) continue;
      take = round2(take);
      blocks.push({ taskId: task.id, hours: take });
      remaining.set(task.id, round2(left - take));
      free = round2(free - take);
      if (remaining.get(task.id)! <= 0) finish[task.id] = date;
    }
    days.push({ date, capacity, habitHours, free, blocks });
  }

  for (const task of queue) if (!(task.id in finish)) finish[task.id] = null;
  const atRisk = queue
    .filter(t => t.due && (finish[t.id] === null || finish[t.id]! > t.due))
    .map(t => t.id);
  return { days, finish, atRisk };
}
