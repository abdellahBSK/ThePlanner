import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { STATE_KEY } from "../lib/store";

/** A static example of the day tape, so the sign-in page shows what the app does. */
function SampleDay() {
  const blocks = [
    { from: 0, len: 45, color: "#14b8a6", label: "Practice: 2 timed problems", time: "18:00" },
    { from: 55, len: 90, color: "#4f7cff", label: "AI: churn decision tree", time: "18:55" },
    { from: 155, len: 60, color: "#ef4f6b", label: "Cyber lab 3", time: "20:35" },
  ];
  const span = 240;
  return (
    <figure className="sample">
      <figcaption>Example evening</figcaption>
      <div className="tape">
        <div className="tape-track">
          {blocks.map(b => <span key={b.label} className="tape-block" style={{ left: `${(b.from / span) * 100}%`, width: `calc(${(b.len / span) * 100}% - 2px)`, background: b.color }} />)}
          <span className="tape-now" style={{ left: `${(70 / span) * 100}%` }} />
        </div>
        <div className="tape-ticks">{[18, 19, 20, 21, 22].map((h, i) => <span key={h} style={{ left: `${(i * 60 / span) * 100}%` }}>{h}</span>)}</div>
      </div>
      <ul>
        {blocks.map(b => <li key={b.label}><span className="num">{b.time}</span><span className="dot" style={{ background: b.color }} />{b.label}</li>)}
      </ul>
    </figure>
  );
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        await api.signup({ name, email, password, timezone });
      } else {
        await api.login({ email, password });
      }
      await qc.resetQueries({ queryKey: STATE_KEY });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-pitch">
        <div className="brand"><img src="/icon.svg" alt="" width={34} height={34} /><span>ThePlanner</span></div>
        <h1>Your deadlines, fitted into the hours you actually have.</h1>
        <p>Add tasks with an estimate and a due date, tell it how many hours you have each day, and get a schedule that keeps every deadline in sight. It warns you early when one won't fit.</p>
        <SampleDay />
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h2>{mode === "signup" ? "Create your planner" : "Welcome back"}</h2>
          {mode === "signup" && (
            <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required maxLength={80} /></label>
          )}
          <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="field"><span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} />
            {mode === "signup" && <small className="hint">At least 8 characters.</small>}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          <p className="switch">
            {mode === "signup" ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">Create an account</Link></>}
          </p>
        </form>
      </section>
    </div>
  );
}
