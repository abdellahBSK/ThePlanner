import type { Habit } from "@theplanner/core";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus, Copy, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead, Stepper } from "../components/bits";
import { useToast } from "../components/Toast";
import { api, ApiError } from "../lib/api";
import { fmtHours, weekdayNames, weekdayShort } from "../lib/format";
import { usePlanner } from "../lib/store";

export function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" />
      <div className="settings">
        <TimeSettings />
        <Habits />
        <Reminders />
        <CalendarFeed />
        <Account />
      </div>
    </>
  );
}

function TimeSettings() {
  const { state, actions } = usePlanner();
  const s = state.user.settings;
  const weekTotal = s.weekdayHours.reduce((a, b) => a + b, 0);
  // Show the week starting on Monday.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <section className="panel" aria-labelledby="time-h">
      <div className="section-head"><h2 id="time-h">Your usual week</h2><span className="muted">{fmtHours(weekTotal)} a week</span></div>
      <p className="hint">Hours you can give to this work outside classes and other commitments, and when your work time starts. Change a single day from Today or Week.</p>
      <div className="week-hours">
        {order.map(i => (
          <div key={i} className="wh-row">
            <span className="wh-day">{weekdayNames[i]}</span>
            <Stepper label={`hours on ${weekdayNames[i]}`} value={s.weekdayHours[i]} max={16}
              onChange={v => { const w = [...s.weekdayHours]; w[i] = v; actions.updateSettings({ weekdayHours: w }); }} />
            <label className="wh-start">
              <span className="sr-only">Start time on {weekdayNames[i]}</span>
              <input type="time" value={s.dayStart[i]} onChange={e => { if (!e.target.value) return; const d = [...s.dayStart]; d[i] = e.target.value; actions.updateSettings({ dayStart: d }); }} />
            </label>
          </div>
        ))}
      </div>
      <div className="field-row">
        <label className="field"><span>Most hours on one task per day</span>
          <Stepper label="most hours per task" value={s.maxPerTaskPerDay} min={0.5} max={12} onChange={v => actions.updateSettings({ maxPerTaskPerDay: v })} />
        </label>
        <label className="field"><span>Break between blocks (minutes)</span>
          <input type="number" min={0} max={120} step={5} value={s.breakMinutes} onChange={e => actions.updateSettings({ breakMinutes: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} />
        </label>
      </div>
    </section>
  );
}

function Habits() {
  const { state, actions } = usePlanner();
  const [adding, setAdding] = useState(false);
  return (
    <section className="panel" aria-labelledby="habits-h">
      <div className="section-head">
        <h2 id="habits-h">Daily habits</h2>
        <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> Habit</button>
      </div>
      <p className="hint">Practice that happens on set days, like interview problems. Its time is reserved before tasks are planned.</p>
      <ul className="habit-list">
        {state.habits.map(h => <HabitRow key={h.id} habit={h} />)}
        {!state.habits.length && !adding && <li className="muted">No habits yet.</li>}
      </ul>
      {adding && (
        <HabitForm onCancel={() => setAdding(false)} onSave={async h => { await actions.createHabit(h); setAdding(false); }} />
      )}
    </section>
  );
}

function HabitRow({ habit }: { habit: Habit }) {
  const { actions } = usePlanner();
  const [editing, setEditing] = useState(false);
  if (editing) return <li><HabitForm initial={habit} onCancel={() => setEditing(false)} onSave={async h => { await actions.updateHabit(habit.id, h); setEditing(false); }} onDelete={() => actions.deleteHabit(habit.id)} /></li>;
  return (
    <li className={`habit-row${habit.active ? "" : " is-paused"}`}>
      <div className="grow">
        <strong>{habit.title}</strong>
        <span className="muted"> · {habit.minutes} min · {habit.days.length === 7 ? "every day" : habit.days.map(d => weekdayShort[d]).join(", ") || "no days"}{habit.active ? "" : " · paused"}</span>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={() => actions.updateHabit(habit.id, { active: !habit.active })}>{habit.active ? "Pause" : "Resume"}</button>
      <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
    </li>
  );
}

function HabitForm({ initial, onSave, onCancel, onDelete }: { initial?: Habit; onSave: (h: Partial<Habit>) => void; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [minutes, setMinutes] = useState(initial?.minutes ?? 30);
  const [days, setDays] = useState<number[]>(initial?.days ?? [1, 2, 3, 4, 5]);
  const [link, setLink] = useState(initial?.link ?? "");
  const toggle = (d: number) => setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort()));
  return (
    <form className="habit-form" onSubmit={e => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), minutes, days, link }); }}>
      <label className="field grow"><span>Habit</span><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Two timed problems" maxLength={200} /></label>
      <label className="field"><span>Minutes</span><input type="number" min={5} max={600} step={5} value={minutes} onChange={e => setMinutes(Math.max(5, Number(e.target.value) || 5))} /></label>
      <fieldset className="field">
        <legend>Days</legend>
        <div className="day-toggles">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} aria-pressed={days.includes(d)} onClick={() => toggle(d)}>{weekdayShort[d]}</button>)}
        </div>
      </fieldset>
      <label className="field grow"><span>Link (optional)</span><input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" /></label>
      <div className="row-gap">
        <button className="btn btn-primary" type="submit" disabled={!title.trim()}>{initial ? "Save" : "Add habit"}</button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
        {onDelete && <button className="btn btn-ghost btn-danger-text" type="button" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      </div>
    </form>
  );
}

type PushState = "unsupported" | "denied" | "off" | "on" | "working";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function Reminders() {
  const { state, actions } = usePlanner();
  const toast = useToast();
  const s = state.user.settings;
  const [push, setPush] = useState<PushState>("working");
  const zones = useMemo(() => {
    try { return (Intl as any).supportedValuesOf("timeZone") as string[]; } catch { return [s.timezone]; }
  }, [s.timezone]);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setPush("unsupported");
      if (Notification.permission === "denied") return setPush("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    })().catch(() => setPush("unsupported"));
  }, []);

  async function enable() {
    setPush("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setPush(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api.pushKey();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await api.pushSubscribe(sub.toJSON());
      setPush("on");
      toast("Notifications are on");
    } catch (e) {
      setPush("off");
      toast(e instanceof ApiError ? e.message : "This browser couldn't turn on notifications.", "error");
    }
  }

  async function disable() {
    setPush("working");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
    setPush("off");
    toast("Notifications are off on this device");
  }

  async function test() {
    try { await api.pushTest(); toast("Test notification sent"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't send the test.", "error"); }
  }

  return (
    <section className="panel" aria-labelledby="rem-h">
      <div className="section-head"><h2 id="rem-h">Reminders</h2></div>
      <p className="hint">Get your plan each morning and a heads-up before each block, on this device. Turn it on separately on your phone and laptop.</p>
      <div className="row-gap wrap">
        {push === "on" && <><button className="btn" onClick={test}><Bell size={15} /> Send a test</button><button className="btn btn-ghost" onClick={disable}>Turn off on this device</button></>}
        {push === "off" && <button className="btn btn-primary" onClick={enable}><Bell size={15} /> Turn on notifications</button>}
        {push === "working" && <button className="btn" disabled>Checking…</button>}
        {push === "denied" && <p className="hint">Notifications are blocked for this site. Allow them in your browser's site settings, then reload.</p>}
        {push === "unsupported" && <p className="hint">This browser can't receive notifications. On iPhone, add ThePlanner to your Home Screen first (Share, then Add to Home Screen).</p>}
      </div>
      <div className="field-row">
        <label className="field"><span>Morning plan at</span><input type="time" value={s.morningTime} onChange={e => e.target.value && actions.updateSettings({ morningTime: e.target.value })} /></label>
        <label className="field"><span>Remind me before a block (minutes)</span><input type="number" min={0} max={120} step={5} value={s.remindBeforeMinutes} onChange={e => actions.updateSettings({ remindBeforeMinutes: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })} /></label>
        <label className="field"><span>Time zone</span>
          <select value={s.timezone} onChange={e => actions.updateSettings({ timezone: e.target.value }, "Time zone saved")}>
            {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function CalendarFeed() {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { api.calendarUrl().then(r => setUrl(r.url)).catch(() => {}); }, []);

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { toast("Select the link and copy it.", "error"); }
  }

  return (
    <section className="panel" aria-labelledby="cal-h">
      <div className="section-head"><h2 id="cal-h"><CalendarPlus size={18} aria-hidden="true" /> Calendar feed</h2></div>
      <p className="hint">Subscribe to this link and your next two weeks of blocks appear in Google Calendar, Outlook or Apple Calendar, updating as your plan changes.</p>
      <div className="copy-field">
        <input readOnly value={url ?? "Loading…"} onFocus={e => e.target.select()} aria-label="Calendar feed link" />
        <button className="btn" onClick={copy} disabled={!url}><Copy size={15} /> Copy</button>
      </div>
      <details className="howto">
        <summary>How to add it</summary>
        <ul>
          <li><strong>Google Calendar:</strong> on a computer, Other calendars, +, From URL, paste the link.</li>
          <li><strong>Outlook:</strong> Add calendar, Subscribe from web, paste the link.</li>
          <li><strong>Apple Calendar:</strong> File, New Calendar Subscription, paste the link.</li>
        </ul>
        <p className="hint">Calendar apps refresh subscribed calendars every few hours, so recent changes can take a while to appear.</p>
      </details>
      <p className="hint">Anyone with the link can see your plan. If it's been shared by mistake, make a new one.</p>
      {confirm
        ? <div className="row-gap"><button className="btn btn-danger" onClick={async () => { const r = await api.rotateCalendar(); setUrl(r.url); setConfirm(false); toast("New link created. Update your calendar app."); }}>Replace the link</button><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep it</button></div>
        : <button className="btn btn-ghost" onClick={() => setConfirm(true)}><RefreshCw size={14} /> Make a new link</button>}
    </section>
  );
}

function Account() {
  const { state } = usePlanner();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(state.user.name);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();

  async function signOut() {
    await api.logout().catch(() => {});
    qc.clear();
    navigate("/login");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.updateMe({ name: name.trim() || undefined, ...(next ? { currentPassword: current, newPassword: next } : {}) });
      setCurrent(""); setNext("");
      toast("Account saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save.", "error");
    }
  }

  return (
    <section className="panel" aria-labelledby="acc-h">
      <div className="section-head"><h2 id="acc-h">Account</h2><span className="muted">{state.user.email}</span></div>
      <form className="account-form" onSubmit={save}>
        <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" /></label>
        <label className="field"><span>Current password</span><input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span>New password</span><input type="password" value={next} onChange={e => setNext(e.target.value)} minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label>
        <div><button className="btn btn-primary" type="submit">Save account</button></div>
      </form>
      <div className="danger-zone">
        <button className="btn" onClick={signOut}><LogOut size={15} /> Sign out</button>
        {confirmDelete
          ? <><span>This deletes your account, tasks and history for good.</span><button className="btn btn-danger" onClick={async () => { await api.deleteMe(); navigate("/signup"); window.location.reload(); }}>Delete my account</button><button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></>
          : <button className="btn btn-ghost btn-danger-text" onClick={() => setConfirmDelete(true)}>Delete account</button>}
      </div>
    </section>
  );
}
