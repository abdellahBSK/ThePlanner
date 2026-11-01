import { addDays, weekday } from "./dates";
import type { IsoDate, Priority } from "./types";

export interface QuickAddResult {
  title: string;
  estimate: number | null;
  due: IsoDate | null;
  priority: Priority | null;
  project: string | null;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function nextYearlyDate(today: IsoDate, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = Number(today.slice(0, 4));
  let candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
  return candidate;
}

/** Reads a date written the way people type it: today, tomorrow, fri, next mon, 7/11, nov 7, 2026-11-07. */
export function parseDate(text: string, today: IsoDate): { date: IsoDate; length: number } | null {
  const s = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(today|tod)\b/))) return { date: today, length: m[0].length };
  if ((m = s.match(/^(tomorrow|tmr|tmrw)\b/))) return { date: addDays(today, 1), length: m[0].length };
  if ((m = s.match(/^in (\d{1,3}) ?(days?|d|weeks?|w)\b/))) {
    const n = Number(m[1]) * (m[2].startsWith("w") ? 7 : 1);
    return { date: addDays(today, n), length: m[0].length };
  }
  if ((m = s.match(/^(next )?([a-z]+)\b/)) && m[2] in WEEKDAYS) {
    // "fri" is the coming Friday (a week away if today is Friday); "next fri" is one week later.
    let diff = (WEEKDAYS[m[2]] - weekday(today) + 7) % 7 || 7;
    if (m[1]) diff += 7;
    return { date: addDays(today, diff), length: m[0].length };
  }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/))) return { date: m[0], length: m[0].length };
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\b/))) {
    const date = nextYearlyDate(today, Number(m[2]), Number(m[1]));
    return date ? { date, length: m[0].length } : null;
  }
  if ((m = s.match(/^([a-z]+) (\d{1,2})\b/)) && m[1] in MONTHS) {
    const date = nextYearlyDate(today, MONTHS[m[1]], Number(m[2]));
    return date ? { date, length: m[0].length } : null;
  }
  if ((m = s.match(/^(\d{1,2}) ([a-z]+)\b/)) && m[2] in MONTHS) {
    const date = nextYearlyDate(today, MONTHS[m[2]], Number(m[1]));
    return date ? { date, length: m[0].length } : null;
  }
  return null;
}

/**
 * Turns one line into a task: "Lab 3 report 4h due fri #Cyber !high".
 * Understands an estimate (2h, 90m, 1.5h), a deadline after "due" or "by",
 * a project after "#" (use - for spaces), and priority as !high, !low or !!.
 */
export function parseQuickAdd(input: string, today: IsoDate): QuickAddResult {
  let text = ` ${input.trim()} `;
  const result: QuickAddResult = { title: "", estimate: null, due: null, priority: null, project: null };

  text = text.replace(/\s(\d+(?:[.,]\d+)?)\s?(h|hr|hrs|hours?|m|min|mins|minutes?)(?=\s)/i, (_, n: string, unit: string) => {
    const value = Number(n.replace(",", "."));
    result.estimate = unit.toLowerCase().startsWith("h") ? value : Math.round((value / 60) * 100) / 100;
    return " ";
  });

  text = text.replace(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (_, name: string) => {
    result.project = name.replace(/[-_]+/g, " ");
    return " ";
  });

  text = text.replace(/\s(!high|!h|!!|!low|!l|!normal)(?=\s)/i, (_, p: string) => {
    const v = p.toLowerCase();
    result.priority = v === "!low" || v === "!l" ? 1 : v === "!normal" ? 2 : 3;
    return " ";
  });

  const dueMatch = text.match(/\s(due|by|on)\s/i);
  if (dueMatch && dueMatch.index !== undefined) {
    const after = text.slice(dueMatch.index + dueMatch[0].length);
    const parsed = parseDate(after, today);
    if (parsed) {
      result.due = parsed.date;
      text = text.slice(0, dueMatch.index) + " " + after.slice(parsed.length);
    }
  }

  result.title = text.replace(/\s+/g, " ").trim();
  return result;
}
