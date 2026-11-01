import { daysBetween, parseIso } from "@theplanner/core";

export function fmtHours(hours: number): string {
  const total = Math.round(hours * 60);
  if (total <= 0) return "0h";
  const h = Math.floor(total / 60), m = total % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dayName = (date: string) => DAY[parseIso(date).getUTCDay()];
export const dayShort = (date: string) => DAY_SHORT[parseIso(date).getUTCDay()];
export const weekdayNames = DAY;
export const weekdayShort = DAY_SHORT;

/** "Fri 6 Nov" */
export function fmtDate(date: string): string {
  const d = parseIso(date);
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "Friday 6 November" */
export function fmtDateLong(date: string): string {
  const d = parseIso(date);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]}`;
}

/** "due tomorrow", "due Fri 6 Nov", "3 days late" */
export function dueLabel(due: string, today: string): { text: string; tone: "late" | "soon" | "calm" } {
  const n = daysBetween(today, due);
  if (n < 0) return { text: n === -1 ? "1 day late" : `${-n} days late`, tone: "late" };
  if (n === 0) return { text: "due today", tone: "soon" };
  if (n === 1) return { text: "due tomorrow", tone: "soon" };
  if (n < 7) return { text: `due ${DAY_SHORT[parseIso(due).getUTCDay()]}`, tone: n <= 3 ? "soon" : "calm" };
  return { text: `due ${fmtDate(due)}`, tone: "calm" };
}

export const PROJECT_COLORS = ["#4f7cff", "#8b5cf6", "#ef4f6b", "#f59e0b", "#84cc16", "#b45309", "#ec4899", "#0ea5e9"];
