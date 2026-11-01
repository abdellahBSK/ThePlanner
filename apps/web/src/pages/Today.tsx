import { buildTimeline, fromMinutes, hoursAvailable, type TimelineItem } from "@theplanner/core";
import { Check, ExternalLink, Pause, Play, Plus, Square, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DayTape } from "../components/DayTape";
import { DueChip, Dot, Empty, Meter, PageHead, Stepper } from "../components/bits";
import { useTaskEditor } from "../components/TaskEditor";
import { fmtDate, fmtDateLong, fmtHours } from "../lib/format";
import { usePlanner } from "../lib/store";

export function TodayPage() {
  const p = usePlanner();
  const { state, today, minutes, plan, taskById, habitById, actions } = p;
  const openEditor = useTaskEditor();
  const [focus, setFocus] = useState<TimelineItem | null>(null);
  const settings = state.user.settings;
  const day = plan.days[0];
  const plannedMinutes = (kind: TimelineItem["kind"], id: string) =>
    kind === "habit" ? habitById.get(id)?.minutes ?? 0 : Math.round((day.blocks.find(b => b.taskId === id)?.hours ?? 0) * 60);
  const doneCheck = (kind: TimelineItem["kind"], id: string) => {
    if (kind === "habit") return (habitById.get(id)?.log[today] ?? 0) > 0;
    const t = taskById.get(id);
    return !t || t.status === "done" || (t.log[today] ?? 0) * 60 >= plannedMinutes(kind, id) - 0.5;
  };
  // Finished items keep their original slot; what's left is laid out again from now, minus time already logged today.
  const { items, doneItems } = useMemo(() => {
    const original = buildTimeline(day, state.habits, settings);
    const startOfDay = original[0]?.startMinutes ?? 0;
    const startAt = minutes > startOfDay ? Math.ceil(minutes / 5) * 5 : undefined;
    const reduced = { ...day, blocks: day.blocks.map(b => ({ ...b, hours: Math.max(0.25, b.hours - (taskById.get(b.taskId)?.log[today] ?? 0)) })) };
    return {
      items: buildTimeline(reduced, state.habits, settings, { startAt, skip: doneCheck }),
      doneItems: original.filter(i => doneCheck(i.kind, i.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, state.habits, settings, minutes, today, taskById, habitById]);
  const tomorrow = plan.days[1];
  const plannedHours = day.blocks.reduce((s, b) => s + b.hours, 0) + day.habitHours;

  if (!state.tasks.length && !state.habits.length) {
    return (
      <>
        <PageHead title={fmtDateLong(today)} />
        <Empty title="Your plan starts with a task" action={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={() => openEditor(null)}><Plus size={16} /> Add a task</button>
            <button className="btn" onClick={() => actions.loadDemo()}>Load an example semester</button>
          </div>
        }>
          Add what you need to get done, with an estimate and a deadline. ThePlanner fits it into the hours you have each day, earliest deadline first.
        </Empty>
      </>
    );
  }

  const current = items.find(i => minutes >= i.startMinutes - 5 && minutes < i.startMinutes + i.minutes);
  const next = items.find(i => i.startMinutes > minutes);
  const openCount = items.length;
  const tapeItems = [...doneItems.filter(d => !items.length || d.startMinutes + d.minutes <= items[0].startMinutes), ...items];
  const titleOf = (i: TimelineItem) => (i.kind === "task" ? taskById.get(i.id)?.title : habitById.get(i.id)?.title) ?? "";

  return (
    <>
      <PageHead title={fmtDateLong(today)} sub={`${fmtHours(plannedHours)} planned · ${openCount ? `${openCount} to go` : "all done"}`} />

      <section className="panel day-panel" aria-label="Today's hours">
        <div className="day-panel-row">
          <div>
            <div className="now-line">
              {current ? <>Now <strong>{titleOf(current)}</strong> <span className="muted">until {current.end}</span></>
                : next ? <>Next at <span className="num">{next.start}</span> <strong>{titleOf(next)}</strong></>
                : doneItems.length ? <strong>Everything for today is done.</strong>
                : <strong>{day.capacity === 0 ? "Day off." : "Nothing left to plan."}</strong>}
            </div>
          </div>
          <label className="inline-label">
            <span>Hours I have today</span>
            <Stepper label="hours today" value={hoursAvailable(settings, today)}
              onChange={v => actions.updateSettings({ overrides: pruneOverrides({ ...settings.overrides, [today]: v }, today) })} />
          </label>
        </div>
        <DayTape items={tapeItems} date={today} />
      </section>

      <RiskBanner />

      <section className="stack" aria-label="Today's schedule">
        {items.length === 0 && !doneItems.length && <Empty title={day.capacity === 0 ? "No hours today" : "Nothing scheduled"}>
          {day.capacity === 0 ? "Add hours above if you want to work today." : "Every open task is done or on hold."}
        </Empty>}
        {items.map(item => <ScheduleRow key={`${item.kind}-${item.id}`} item={item} planned={plannedMinutes(item.kind, item.id) / 60} done={false} onFocus={() => setFocus(item)} />)}
      </section>

      {doneItems.length > 0 && (
        <section className="stack" aria-label="Done today">
          <div className="section-head"><h2>Done today</h2><span className="muted">{fmtHours(doneItems.reduce((s, i) => s + i.minutes, 0) / 60)}</span></div>
          {doneItems.map(item => <ScheduleRow key={`done-${item.kind}-${item.id}`} item={item} planned={item.minutes / 60} done onFocus={() => setFocus(item)} />)}
        </section>
      )}

      {tomorrow && (
        <section className="panel">
          <div className="section-head">
            <h2>Tomorrow</h2>
            <span className="muted">{fmtDate(tomorrow.date)} · {fmtHours(tomorrow.capacity)} available</span>
          </div>
          <DayTape items={buildTimeline(tomorrow, state.habits, settings)} date={tomorrow.date} compact />
          <ul className="mini-list">
            {tomorrow.blocks.slice(0, 4).map(b => {
              const t = taskById.get(b.taskId)!;
              return <li key={b.taskId}><Dot color={p.projectColor(t.projectId)} /><span>{t.title}</span><span className="num muted">{fmtHours(b.hours)}</span></li>;
            })}
            {!tomorrow.blocks.length && <li className="muted">Nothing scheduled.</li>}
          </ul>
        </section>
      )}

      {focus && <FocusTimer item={focus} title={titleOf(focus)} onClose={() => setFocus(null)} />}
    </>
  );
}

export function pruneOverrides(overrides: Record<string, number>, today: string) {
  return Object.fromEntries(Object.entries(overrides).filter(([d]) => d >= today));
}

function ScheduleRow({ item, planned, done, onFocus }: { item: TimelineItem; planned: number; done: boolean; onFocus: () => void }) {
  const { today, minutes, taskById, habitById, plan, projectColor, projectName, actions } = usePlanner();
  const openEditor = useTaskEditor();
  const task = item.kind === "task" ? taskById.get(item.id) : undefined;
  const habit = item.kind === "habit" ? habitById.get(item.id) : undefined;
  const entity = task ?? habit;
  if (!entity) return null;
  const logged = entity.log[today] ?? 0;
  const isNow = minutes >= item.startMinutes && minutes < item.startMinutes + item.minutes;
  const color = task ? projectColor(task.projectId) : "var(--habit)";

  const toggleDone = () => {
    if (habit) actions.setLog(habit.id, today, done ? 0 : habit.minutes / 60);
    else if (task) actions.setLog(task.id, today, done ? 0 : Math.max(logged, planned));
  };

  return (
    <article className={`slot${done ? " is-done" : ""}${isNow && !done ? " is-now" : ""}`} style={{ ["--slot-color" as any]: color }}>
      <div className="slot-time num">
        <span>{item.start}</span>
        <span className="muted">{item.end}</span>
      </div>
      <div className="slot-card">
        <button className={`tick${habit ? " tick-round" : ""}`} aria-pressed={done} onClick={toggleDone}
          aria-label={done ? `Mark not done: ${entity.title}` : `Done for today: ${entity.title}`}>
          {done && <Check size={14} strokeWidth={3} />}
        </button>
        <div className="slot-body">
          <button className="slot-title" onClick={() => task && openEditor(task.id)} disabled={!task}>{entity.title}</button>
          <div className="meta">
            <span>{task ? projectName(task.projectId) : "Habit"}</span>
            {task && <DueChip due={task.due} today={today} confirmed={task.dueConfirmed} atRisk={plan.atRisk.includes(task.id)} />}
            {entity.link && <a href={entity.link} target="_blank" rel="noreferrer" className="link"><ExternalLink size={13} /> Open</a>}
          </div>
          {task && (
            <div className="slot-progress">
              <Meter value={Object.values(task.log).reduce((a, b) => a + b, 0)} max={task.estimate} />
              <span className="muted num">{fmtHours(logged)} of {fmtHours(planned)} today</span>
            </div>
          )}
        </div>
        <div className="slot-actions">
          <span className="num slot-len">{fmtHours(item.minutes / 60)}</span>
          {!done && (
            <div className="row-gap">
              {task && <button className="btn btn-sm" onClick={() => actions.setLog(task.id, today, logged + 0.5)}>+30 min</button>}
              <button className="btn btn-sm" onClick={onFocus}><Timer size={14} /> Focus</button>
              {task && <button className="btn btn-sm btn-primary" onClick={() => actions.updateTask(task.id, { status: "done" }, "Task finished")}>Finish task</button>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RiskBanner() {
  const { plan, taskById } = usePlanner();
  if (!plan.atRisk.length) return null;
  return (
    <section className="risk" role="alert">
      <strong>{plan.atRisk.length === 1 ? "One deadline" : `${plan.atRisk.length} deadlines`} won't be met at your current hours</strong>
      <ul>
        {plan.atRisk.slice(0, 4).map(id => {
          const t = taskById.get(id)!;
          const f = plan.finish[id];
          return <li key={id}>{t.title}: due {fmtDate(t.due!)}, {f ? `finishes ${fmtDate(f)}` : "doesn't fit in the next six weeks"}</li>;
        })}
      </ul>
      <span className="muted">Add hours on the coming days, shorten an estimate, or move a deadline.</span>
    </section>
  );
}

/** A countdown for one block; stopping it logs the time worked. */
function FocusTimer({ item, title, onClose }: { item: TimelineItem; title: string; onClose: () => void }) {
  const { today, taskById, habitById, actions } = usePlanner();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const total = item.minutes * 60;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.max(0, total - elapsed);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  async function stop() {
    const entity = item.kind === "task" ? taskById.get(item.id) : habitById.get(item.id);
    const minutesWorked = Math.round(elapsed / 60);
    if (entity && minutesWorked > 0) await actions.setLog(entity.id, today, Math.round(((entity.log[today] ?? 0) + minutesWorked / 60) * 100) / 100);
    onClose();
  }

  return (
    <div className="focus" role="dialog" aria-modal="true" aria-label={`Focus on ${title}`}>
      <div className="focus-inner">
        <p className="muted">Focusing on</p>
        <h2>{title}</h2>
        <div className="focus-clock num" aria-live="off">{mm}:{ss}</div>
        <div className="focus-bar"><i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} /></div>
        <p className="muted">{left === 0 ? "Time's up. Stop to log it." : `Planned until ${fromMinutes(item.startMinutes + item.minutes)}`}</p>
        <div className="row-gap center">
          <button className="btn" onClick={() => setRunning(r => !r)}>{running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Resume</>}</button>
          <button className="btn btn-primary" onClick={stop}><Square size={14} /> Stop and log {fmtHours(Math.round(elapsed / 60) / 60)}</button>
        </div>
        <button className="btn btn-ghost" onClick={onClose}>Close without logging</button>
      </div>
    </div>
  );
}
