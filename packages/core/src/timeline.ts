import { fromMinutes, toMinutes, weekday } from "./dates";
import { habitsOn } from "./scheduler";
import type { DayPlan, Habit, Settings } from "./types";

export interface TimelineItem {
  kind: "habit" | "task";
  /** Habit or task id. */
  id: string;
  start: string;
  end: string;
  startMinutes: number;
  minutes: number;
  /** True when the item runs past midnight and was cut. */
  overflow: boolean;
}

/**
 * Lay a day out on the clock: habits first, then the day's blocks in plan order,
 * starting at the day's start time with a short break between items.
 */
export function buildTimeline(day: DayPlan, habits: Habit[], settings: Settings, options: { startAt?: number; skip?: (kind: TimelineItem["kind"], id: string) => boolean } = {}): TimelineItem[] {
  // startAt lets today's remaining work start from the current time when the day's start has passed.
  const startOfDay = Math.max(toMinutes(settings.dayStart[weekday(day.date)] ?? "09:00"), options.startAt ?? 0);
  const items: Array<{ kind: TimelineItem["kind"]; id: string; minutes: number }> = [
    ...habitsOn(habits, day.date).map(h => ({ kind: "habit" as const, id: h.id, minutes: h.minutes })),
    ...day.blocks.map(b => ({ kind: "task" as const, id: b.taskId, minutes: Math.round(b.hours * 60) })),
  ];

  const skip = options.skip;
  const kept = skip ? items.filter(i => !skip(i.kind, i.id)) : items;
  const out: TimelineItem[] = [];
  let cursor = startOfDay;
  for (const item of kept) {
    const end = cursor + item.minutes;
    out.push({
      kind: item.kind,
      id: item.id,
      start: fromMinutes(cursor),
      end: fromMinutes(Math.min(end, 24 * 60)),
      startMinutes: cursor,
      minutes: item.minutes,
      overflow: end > 24 * 60,
    });
    cursor = end + settings.breakMinutes;
  }
  return out;
}
