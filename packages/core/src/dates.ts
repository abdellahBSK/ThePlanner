import type { IsoDate } from "./types";

const DAY_MS = 86_400_000;

export function parseIso(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatIso(new Date(parseIso(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

/** 0 = Sunday. */
export function weekday(date: IsoDate): number {
  return parseIso(date).getUTCDay();
}

/** Today's date and the current minute of the day in an IANA time zone. */
export function nowIn(timeZone: string, at: Date = new Date()): { date: IsoDate; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "18:30" -> 1110 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 1110 -> "18:30" */
export function fromMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;
