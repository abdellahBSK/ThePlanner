import type { Priority, RepeatUnit, Task, TaskStatus } from "@theplanner/core";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fmtHours, PROJECT_COLORS } from "../lib/format";
import { usePlanner } from "../lib/store";

type Draft = Omit<Task, "id" | "log" | "createdAt" | "doneAt" | "nextId">;
const EditorContext = createContext<(taskId: string | null, preset?: Partial<Draft>) => void>(() => {});
export const useTaskEditor = () => useContext(EditorContext);

const blank: Draft = { title: "", projectId: null, estimate: 2, due: null, dueConfirmed: true, priority: 2, status: "todo", notBefore: null, notes: "", link: "", repeat: null };

const clampInterval = (text: string) => Math.min(365, Math.max(1, Math.round(Number(text)) || 1));

export function TaskEditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ id: string | null; preset?: Partial<Draft> } | null>(null);
  const openEditor = useCallback((id: string | null, preset?: Partial<Draft>) => setOpen({ id, preset }), []);
  return (
    <EditorContext.Provider value={openEditor}>
      {children}
      {open && <TaskEditor key={open.id ?? "new"} taskId={open.id} preset={open.preset} onClose={() => setOpen(null)} />}
    </EditorContext.Provider>
  );
}

function TaskEditor({ taskId, preset, onClose }: { taskId: string | null; preset?: Partial<Draft>; onClose: () => void }) {
  const { state, taskById, plan, actions } = usePlanner();
  const existing = taskId ? taskById.get(taskId) : undefined;
  const [draft, setDraft] = useState<Draft>(() => (existing ? { ...existing } : { ...blank, ...preset }));
  const [intervalText, setIntervalText] = useState(String(existing?.repeat?.interval ?? 1));
  const [newProject, setNewProject] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    const repeat = draft.repeat ? { unit: draft.repeat.unit, interval: clampInterval(intervalText) } : null;
    const payload = { ...draft, repeat, title: draft.title.trim(), ...(draft.projectId === "__new" ? { projectId: null, projectName: newProject.trim() || "New project" } : {}) };
    const ok = existing ? await actions.updateTask(existing.id, payload, "Saved") : await actions.createTask(payload);
    setSaving(false);
    if (ok) onClose();
  }

  const logged = existing ? Object.values(existing.log).reduce((a, b) => a + b, 0) : 0;
  const finish = existing ? plan.finish[existing.id] : undefined;

  return (
    <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="editor-title" ref={panel}>
        <header className="drawer-head">
          <h2 id="editor-title">{existing ? "Edit task" : "New task"}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form className="drawer-body" onSubmit={save}>
          <label className="field">
            <span>Title</span>
            <input value={draft.title} onChange={e => set("title", e.target.value)} required maxLength={300} placeholder="What needs doing?" />
          </label>

          <label className="field">
            <span>Project</span>
            <select value={draft.projectId ?? ""} onChange={e => set("projectId", e.target.value || null)}>
              <option value="">No project</option>
              {state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new">New project…</option>
            </select>
          </label>
          {draft.projectId === "__new" && (
            <label className="field">
              <span>New project name</span>
              <input value={newProject} onChange={e => setNewProject(e.target.value)} placeholder={`e.g. Big Data (colour ${PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length]})`} />
            </label>
          )}

          <div className="field-row">
            <label className="field">
              <span>Estimate (hours)</span>
              <input type="number" min={0.25} max={500} step={0.25} value={draft.estimate} onChange={e => set("estimate", Math.max(0.25, Number(e.target.value) || 0.25))} />
            </label>
            <label className="field">
              <span>Deadline</span>
              <input type="date" value={draft.due ?? ""} onChange={e => set("due", e.target.value || null)} />
            </label>
          </div>
          {draft.due && (
            <label className="check">
              <input type="checkbox" checked={!draft.dueConfirmed} onChange={e => set("dueConfirmed", !e.target.checked)} />
              <span>This deadline is a guess</span>
            </label>
          )}

          <fieldset className="field">
            <legend>Priority</legend>
            <div className="segmented">
              {([[3, "High"], [2, "Normal"], [1, "Low"]] as [Priority, string][]).map(([v, l]) => (
                <button type="button" key={v} aria-pressed={draft.priority === v} onClick={() => set("priority", v)}>{l}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Status</legend>
            <div className="segmented">
              {([["todo", "To do"], ["waiting", "On hold"], ["done", "Done"]] as [TaskStatus, string][]).map(([v, l]) => (
                <button type="button" key={v} aria-pressed={draft.status === v} onClick={() => set("status", v)}>{l}</button>
              ))}
            </div>
            <small className="hint">Tasks on hold stay in your list but aren't scheduled.</small>
          </fieldset>

          <label className="field">
            <span>Repeat</span>
            <select
              value={draft.repeat ? "on" : ""}
              onChange={e => {
                set("repeat", e.target.value ? { unit: draft.repeat?.unit ?? "week", interval: draft.repeat?.interval ?? 1 } : null);
                setIntervalText("1");
              }}
            >
              <option value="">Never</option>
              <option value="on">Repeat every…</option>
            </select>
          </label>
          {draft.repeat && (
            <div className="field-row">
              <label className="field">
                <span>Repeat every</span>
                <input
                  type="number" min={1} max={365} step={1} inputMode="numeric" value={intervalText}
                  onChange={e => {
                    setIntervalText(e.target.value);
                    const n = Math.round(Number(e.target.value));
                    if (e.target.value !== "" && n >= 1 && n <= 365) set("repeat", { unit: draft.repeat!.unit, interval: n });
                  }}
                  onBlur={() => { const n = clampInterval(intervalText); setIntervalText(String(n)); set("repeat", { unit: draft.repeat!.unit, interval: n }); }}
                />
              </label>
              <label className="field">
                <span>Unit</span>
                <select value={draft.repeat.unit} onChange={e => set("repeat", { unit: e.target.value as RepeatUnit, interval: draft.repeat!.interval })}>
                  <option value="day">{draft.repeat.interval === 1 ? "day" : "days"}</option>
                  <option value="week">{draft.repeat.interval === 1 ? "week" : "weeks"}</option>
                  <option value="month">{draft.repeat.interval === 1 ? "month" : "months"}</option>
                </select>
              </label>
            </div>
          )}
          {draft.repeat && <small className="hint">The next one is created when you finish this task{draft.due ? "." : ", but only if it has a deadline."}</small>}

          <label className="field">
            <span>Don't start before</span>
            <input type="date" value={draft.notBefore ?? ""} onChange={e => set("notBefore", e.target.value || null)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={draft.notes} onChange={e => set("notes", e.target.value)} rows={3} maxLength={5000} />
          </label>
          <label className="field">
            <span>Link</span>
            <input type="url" value={draft.link} onChange={e => set("link", e.target.value)} placeholder="https://" />
          </label>

          {existing && (
            <p className="hint">
              {fmtHours(logged)} logged of {fmtHours(existing.estimate)}.{" "}
              {existing.status === "todo" && (finish ? `Planned to finish ${finish}.` : "Doesn't fit in the next six weeks.")}
            </p>
          )}

          <footer className="drawer-foot">
            {existing ? (
              confirmDelete ? (
                <span className="confirm">
                  <button type="button" className="btn btn-danger" onClick={async () => { await actions.deleteTask(existing.id); onClose(); }}>Delete task</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}>Delete</button>
              )
            ) : <span />}
            <button type="submit" className="btn btn-primary" disabled={saving || !draft.title.trim()}>{existing ? "Save" : "Add task"}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}
