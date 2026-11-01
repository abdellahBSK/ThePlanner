import type { TimelineItem } from "@theplanner/core";
import { fromMinutes } from "@theplanner/core";
import { usePlanner } from "../lib/store";

/**
 * The day drawn as a measuring tape: hour ticks, each block to scale in its project's
 * colour, and a marker for the current time.
 */
export function DayTape({ items, date, compact = false }: { items: TimelineItem[]; date: string; compact?: boolean }) {
  const { today, minutes, taskById, habitById, projectColor } = usePlanner();
  if (!items.length) return <div className={`tape tape-empty${compact ? " tape-compact" : ""}`}><span>Nothing planned</span></div>;

  const start = Math.floor(items[0].startMinutes / 60) * 60;
  const lastEnd = items[items.length - 1].startMinutes + items[items.length - 1].minutes;
  const end = Math.max(start + 120, Math.ceil(lastEnd / 60) * 60);
  const span = end - start;
  const pos = (m: number) => `${((m - start) / span) * 100}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => start + i * 60);
  const showNow = date === today && minutes >= start && minutes <= end;

  return (
    <div className={`tape${compact ? " tape-compact" : ""}`} aria-hidden="true">
      <div className="tape-track">
        {items.map(item => {
          const task = item.kind === "task" ? taskById.get(item.id) : undefined;
          const habit = item.kind === "habit" ? habitById.get(item.id) : undefined;
          const logged = (task ?? habit)?.log[date] ?? 0;
          const done = item.kind === "habit" ? logged > 0 : task?.status === "done" || logged * 60 >= item.minutes - 0.5;
          return (
            <span
              key={`${item.kind}-${item.id}`}
              className={`tape-block${done ? " is-done" : ""}${item.kind === "habit" ? " is-habit" : ""}`}
              style={{ left: pos(item.startMinutes), width: `calc(${(item.minutes / span) * 100}% - 2px)`, background: task ? projectColor(task.projectId) : "var(--habit)" }}
              title={`${item.start}–${item.end} ${task?.title ?? habit?.title ?? ""}`}
            />
          );
        })}
        {showNow && <span className="tape-now" style={{ left: pos(minutes) }} />}
      </div>
      {!compact && (
        <div className="tape-ticks">
          {hours.map((h, i) => (
            <span key={h} style={{ left: pos(h) }}>{hours.length > 9 && i % 2 && i !== hours.length - 1 ? "" : fromMinutes(h).replace(":00", "")}</span>
          ))}
        </div>
      )}
    </div>
  );
}
