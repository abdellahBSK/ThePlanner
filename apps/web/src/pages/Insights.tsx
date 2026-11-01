import { addDays, loggedTotal } from "@theplanner/core";
import { DueChip, Dot, Empty, PageHead } from "../components/bits";
import { dayShort, fmtDate, fmtHours } from "../lib/format";
import { usePlanner } from "../lib/store";

export function InsightsPage() {
  const { state, today, plan, projectColor, projectName } = usePlanner();
  const all = [...state.tasks, ...state.habits];
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const perDay = days.map(d => all.reduce((s, x) => s + (x.log[d] ?? 0), 0));
  const week = perDay.slice(7).reduce((a, b) => a + b, 0);
  const prevWeek = perDay.slice(0, 7).reduce((a, b) => a + b, 0);
  const doneThisWeek = state.tasks.filter(t => t.doneAt && t.doneAt.slice(0, 10) > addDays(today, -7)).length;

  const finished = state.tasks.filter(t => t.status === "done" && loggedTotal(t) > 0);
  const accuracy = finished.length ? finished.reduce((s, t) => s + loggedTotal(t) / t.estimate, 0) / finished.length : null;

  const streak = (() => {
    let n = 0;
    for (let i = 0; i < 365; i++) {
      const d = addDays(today, -i);
      const any = state.habits.some(h => (h.log[d] ?? 0) > 0);
      if (any) n++;
      else if (i > 0) break;
    }
    return n;
  })();

  const projects = [...state.projects.map(p => p.id), null].map(id => {
    const tasks = state.tasks.filter(t => t.projectId === id);
    return { id, estimate: tasks.reduce((s, t) => s + t.estimate, 0), logged: tasks.reduce((s, t) => s + loggedTotal(t), 0) };
  }).filter(p => p.estimate > 0);
  const maxProject = Math.max(1, ...projects.map(p => Math.max(p.estimate, p.logged)));

  const upcoming = state.tasks.filter(t => t.status === "todo" && t.due).sort((a, b) => (a.due! < b.due! ? -1 : 1)).slice(0, 6);

  if (!state.tasks.length) return <><PageHead title="Insights" /><Empty title="Nothing to show yet">Log some work and your hours, pace and estimates show up here.</Empty></>;

  const maxDay = Math.max(1, ...perDay);
  const H = 140, barW = 100 / 14;
  return (
    <>
      <PageHead title="Insights" sub="Where your hours go, and how your estimates hold up" />
      <div className="stats">
        <div className="stat"><b className="num">{fmtHours(week)}</b><span>logged in the last 7 days</span><small className={week >= prevWeek ? "up" : "down"}>{prevWeek ? `${week >= prevWeek ? "+" : "−"}${fmtHours(Math.abs(week - prevWeek))} vs the week before` : "first week"}</small></div>
        <div className="stat"><b className="num">{doneThisWeek}</b><span>tasks finished this week</span></div>
        <div className="stat"><b className="num">{streak}</b><span>day practice streak</span></div>
        <div className="stat"><b className="num">{accuracy === null ? "–" : `${Math.round(accuracy * 100)}%`}</b><span>of estimate used, on average</span><small>{accuracy === null ? "Finish a task with logged time to see this" : accuracy > 1.15 ? "Tasks take longer than you estimate" : accuracy < 0.85 ? "You finish faster than you estimate" : "Your estimates are on target"}</small></div>
      </div>

      <section className="panel">
        <div className="section-head"><h2>Hours logged, last 14 days</h2></div>
        <div className="chart" role="img" aria-label={`Hours logged per day over the last 14 days, ${fmtHours(perDay.reduce((a, b) => a + b, 0))} in total`}>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
            {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2="100" y1={H - f * H} y2={H - f * H} className="grid" />)}
            {perDay.map((v, i) => {
              const h = (v / maxDay) * (H - 8);
              return <rect key={i} x={i * barW + barW * 0.18} width={barW * 0.64} y={H - h} height={h} rx="0.6" className={days[i] === today ? "bar bar-today" : "bar"} />;
            })}
          </svg>
          <div className="chart-x">{days.map((d, i) => <span key={d}>{i % 2 === 1 || d === today ? dayShort(d).slice(0, 2) : ""}</span>)}</div>
          <div className="chart-max num muted">{fmtHours(maxDay)}</div>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="section-head"><h2>Estimate and logged, by project</h2></div>
          <ul className="hbars">
            {projects.map(p => (
              <li key={p.id ?? "none"}>
                <span className="hbar-label"><Dot color={projectColor(p.id)} />{projectName(p.id)}</span>
                <span className="hbar-track">
                  <i className="hbar-est" style={{ width: `${(p.estimate / maxProject) * 100}%` }} />
                  <i className="hbar-log" style={{ width: `${(p.logged / maxProject) * 100}%`, background: projectColor(p.id) }} />
                </span>
                <span className="num muted">{fmtHours(p.logged)} / {fmtHours(p.estimate)}</span>
              </li>
            ))}
          </ul>
          <p className="hint">The pale bar is the estimate; the coloured bar is the time logged.</p>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Next deadlines</h2></div>
          <ul className="deadlines">
            {upcoming.map(t => (
              <li key={t.id}>
                <Dot color={projectColor(t.projectId)} />
                <span className="grow">{t.title}</span>
                <DueChip due={t.due} today={today} confirmed={t.dueConfirmed} atRisk={plan.atRisk.includes(t.id)} />
                <span className="muted small">{plan.finish[t.id] ? `ready ${fmtDate(plan.finish[t.id]!)}` : "won't fit"}</span>
              </li>
            ))}
            {!upcoming.length && <li className="muted">No open tasks with a deadline.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
