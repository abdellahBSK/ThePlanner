import { buildTimeline, hoursAvailable } from "@theplanner/core";
import { DayTape } from "../components/DayTape";
import { DueChip, Dot, PageHead, Stepper } from "../components/bits";
import { useTaskEditor } from "../components/TaskEditor";
import { dayName, fmtDate, fmtHours } from "../lib/format";
import { usePlanner } from "../lib/store";
import { pruneOverrides } from "./Today";

export function WeekPage() {
  const { state, today, plan, taskById, habitById, projectColor, actions } = usePlanner();
  const openEditor = useTaskEditor();
  const settings = state.user.settings;
  const week = plan.days.slice(0, 7);
  const weekHours = week.reduce((s, d) => s + d.blocks.reduce((a, b) => a + b.hours, 0) + d.habitHours, 0);
  const later = plan.days.slice(7).reduce((s, d) => s + d.blocks.reduce((a, b) => a + b.hours, 0), 0);
  const lastFinish = Object.values(plan.finish).filter(Boolean).sort().pop();

  return (
    <>
      <PageHead title="Next 7 days" sub={`${fmtHours(weekHours)} planned this week${later ? ` · ${fmtHours(later)} more after` : ""}${lastFinish ? ` · everything done by ${fmtDate(lastFinish)}` : ""}`} />
      <div className="week">
        {week.map((d, i) => {
          const items = buildTimeline(d, state.habits, settings);
          return (
            <section key={d.date} className={`day-col${i === 0 ? " is-today" : ""}`} aria-label={fmtDate(d.date)}>
              <header>
                <div>
                  <h2>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName(d.date)}</h2>
                  <span className="muted">{fmtDate(d.date)}</span>
                </div>
                <Stepper label={`hours on ${fmtDate(d.date)}`} value={hoursAvailable(settings, d.date)}
                  onChange={v => actions.updateSettings({ overrides: pruneOverrides({ ...settings.overrides, [d.date]: v }, today) })} />
              </header>
              <DayTape items={items} date={d.date} compact />
              <ul className="day-items">
                {items.map(item => {
                  const t = item.kind === "task" ? taskById.get(item.id) : undefined;
                  const h = item.kind === "habit" ? habitById.get(item.id) : undefined;
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <span className="num muted day-time">{item.start}</span>
                      <Dot color={t ? projectColor(t.projectId) : "var(--habit)"} />
                      <button className="day-title" onClick={() => t && openEditor(t.id)} disabled={!t}>
                        {t?.title ?? h?.title}
                        {t && plan.finish[t.id] === d.date && <span className="chip chip-ok">finishes</span>}
                        {t?.due === d.date && <DueChip due={t.due} today={today} confirmed={t.dueConfirmed} atRisk={plan.atRisk.includes(t.id)} />}
                      </button>
                      <span className="num muted">{fmtHours(item.minutes / 60)}</span>
                    </li>
                  );
                })}
                {!items.length && <li className="muted">{d.capacity === 0 ? "Day off" : "Free"}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
