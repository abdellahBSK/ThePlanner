export interface CalendarEvent {
  uid: string;
  /** Local date YYYY-MM-DD and time HH:MM in `timeZone`. */
  date: string;
  start: string;
  minutes: number;
  title: string;
  description?: string;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded, as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

function localStamp(date: string, minutes: number): string {
  const dayOffset = Math.floor(minutes / 1440);
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + dayOffset));
  const m = minutes - dayOffset * 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${d.toISOString().slice(0, 10).replace(/-/g, "")}T${hh}${mm}00`;
}

/** An iCalendar feed. Times are floating local times tagged with the user's time zone. */
export function buildIcs(events: CalendarEvent[], options: { name: string; timeZone: string; now?: Date }): string {
  const stamp = (options.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ThePlanner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
    `X-WR-TIMEZONE:${options.timeZone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    const [h, m] = e.start.split(":").map(Number);
    const startMin = h * 60 + m;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${options.timeZone}:${localStamp(e.date, startMin)}`,
      `DTEND;TZID=${options.timeZone}:${localStamp(e.date, startMin + e.minutes)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
