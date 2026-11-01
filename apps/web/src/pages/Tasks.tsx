import { loggedTotal, type Project, type Task } from "@theplanner/core";
import { Check, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { DueChip, Dot, Empty, Meter, PageHead } from "../components/bits";
import { useTaskEditor } from "../components/TaskEditor";
import { fmtDate, fmtHours, PROJECT_COLORS } from "../lib/format";
import { usePlanner } from "../lib/store";

type Filter = "open" | "waiting" | "done" | "all";
const FILTERS: [Filter, string][] = [["open", "To do"], ["waiting", "On hold"], ["done", "Done"], ["all", "All"]];

export function TasksPage() {
  const { state, plan, today, actions } = usePlanner();
  const openEditor = useTaskEditor();
  const [filter, setFilter] = useState<Filter>("open");
  const [project, setProject] = useState<string>("all");
  const [newProject, setNewProject] = useState(false);

  const groups = useMemo(() => {
    const matches = (t: Task) =>
      (filter === "all" || (filter === "open" ? t.status === "todo" : t.status === filter)) &&
      (project === "all" || (t.projectId ?? "none") === project);
    const sorted = state.tasks.filter(matches).sort((a, b) => (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : b.priority - a.priority);
    const byProject = new Map<string, Task[]>();
    for (const t of sorted) {
      const key = t.projectId ?? "none";
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(t);
    }
    const order = [...state.projects.map(p => p.id), "none"];
    return order.filter(id => byProject.has(id)).map(id => ({ id, tasks: byProject.get(id)! }));
  }, [state.tasks, state.projects, filter, project]);

  const openHours = state.tasks.filter(t => t.status === "todo").reduce((s, t) => s + Math.max(0, t.estimate - loggedTotal(t)), 0);

  return (
    <>
      <PageHead title="Tasks" sub={`${state.tasks.filter(t => t.status === "todo").length} open · ${fmtHours(openHours)} of work left${plan.atRisk.length ? ` · ${plan.atRisk.length} at risk` : ""}`}>
        <button className="btn" onClick={() => setNewProject(v => !v)}><Plus size={16} /> Project</button>
        <button className="btn btn-primary" onClick={() => openEditor(null, project !== "all" && project !== "none" ? { projectId: project } : undefined)}><Plus size={16} /> Task</button>
      </PageHead>

      {newProject && <NewProject onDone={() => setNewProject(false)} />}

      <div className="filters">
        <div className="segmented" role="group" aria-label="Status">
          {FILTERS.map(([v, l]) => <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <label className="sr-only" htmlFor="project-filter">Project</label>
        <select id="project-filter" value={project} onChange={e => setProject(e.target.value)}>
          <option value="all">All projects</option>
          {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="none">No project</option>
        </select>
      </div>

      {!groups.length && (
        <Empty title={state.tasks.length ? "No tasks match" : "No tasks yet"} action={!state.tasks.length && <button className="btn" onClick={() => actions.loadDemo()}>Load an example semester</button>}>
          {state.tasks.length ? "Try another filter." : "Type a task in the bar at the top, or press the Task button."}
        </Empty>
      )}

      {groups.map(g => (
        <ProjectGroup key={g.id} project={state.projects.find(p => p.id === g.id) ?? null} tasks={g.tasks} />
      ))}
    </>
  );
}

function ProjectGroup({ project, tasks }: { project: Project | null; tasks: Task[] }) {
  const { state, plan, today, actions } = usePlanner();
  const openEditor = useTaskEditor();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [confirm, setConfirm] = useState(false);
  const all = state.tasks.filter(t => (t.projectId ?? null) === (project?.id ?? null));
  const estimate = all.reduce((s, t) => s + t.estimate, 0);
  const done = all.reduce((s, t) => s + (t.status === "done" ? t.estimate : Math.min(loggedTotal(t), t.estimate)), 0);
  const color = project?.color ?? "var(--muted)";

  return (
    <section className="group" style={{ ["--group-color" as any]: color }}>
      <header className="group-head">
        <div className="group-title">
          <Dot color={color} />
          <h2>{project?.name ?? "No project"}</h2>
          {project && <button className="icon-btn" aria-label={`Edit project ${project.name}`} onClick={() => setEditing(v => !v)}><Pencil size={15} /></button>}
        </div>
        <div className="group-progress">
          <Meter value={done} max={estimate} color={color} />
          <span className="num muted">{estimate ? Math.round((done / estimate) * 100) : 0}% · {fmtHours(Math.max(0, estimate - done))} left</span>
        </div>
      </header>

      {editing && project && (
        <form className="inline-form" onSubmit={e => { e.preventDefault(); if (name.trim()) actions.updateProject(project.id, { name: name.trim() }); setEditing(false); }}>
          <label className="field grow"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></label>
          <div className="field">
            <span>Colour</span>
            <div className="swatches">
              {PROJECT_COLORS.map(c => (
                <button type="button" key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={project.color === c} onClick={() => actions.updateProject(project.id, { color: c })} />
              ))}
            </div>
          </div>
          <button className="btn btn-primary" type="submit">Save</button>
          {confirm
            ? <button type="button" className="btn btn-danger" onClick={() => actions.deleteProject(project.id)}>Delete project, keep tasks</button>
            : <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirm(true)}>Delete</button>}
        </form>
      )}

      <ul className="task-list">
        {tasks.map(t => {
          const logged = loggedTotal(t);
          const finish = plan.finish[t.id];
          return (
            <li key={t.id} className={`task-row${t.status === "done" ? " is-done" : ""}`}>
              <button className="tick" aria-pressed={t.status === "done"} aria-label={t.status === "done" ? `Reopen ${t.title}` : `Finish ${t.title}`}
                onClick={() => actions.updateTask(t.id, { status: t.status === "done" ? "todo" : "done" }, t.status === "done" ? "Reopened" : "Task finished")}>
                {t.status === "done" && <Check size={14} strokeWidth={3} />}
              </button>
              <button className="task-main" onClick={() => openEditor(t.id)}>
                <span className="task-title">{t.title}</span>
                <span className="meta">
                  <DueChip due={t.due} today={today} confirmed={t.dueConfirmed} atRisk={plan.atRisk.includes(t.id)} />
                  <span className="chip num">{logged ? `${fmtHours(logged)} / ` : ""}{fmtHours(t.estimate)}</span>
                  {t.priority === 3 && <span className="chip chip-soon">high</span>}
                  {t.status === "waiting" && <span className="chip">on hold</span>}
                  {t.status === "todo" && <span className="muted">{finish ? `finishes ${fmtDate(finish)}` : "doesn't fit in 6 weeks"}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewProject({ onDone }: { onDone: () => void }) {
  const { state, actions } = usePlanner();
  const [name, setName] = useState("");
  return (
    <form className="panel inline-form" onSubmit={async e => { e.preventDefault(); if (name.trim()) { await actions.createProject(name.trim(), PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length]); onDone(); } }}>
      <label className="field grow"><span>Project name</span><input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="e.g. Big Data" /></label>
      <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Create project</button>
      <button className="btn btn-ghost" type="button" onClick={onDone}>Cancel</button>
    </form>
  );
}
