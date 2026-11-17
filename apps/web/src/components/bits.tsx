import { Minus, Plus } from "lucide-react";
import type { Repeat } from "@theplanner/core";
import type { ReactNode } from "react";
import { dueLabel, fmtHours } from "../lib/format";

export function Stepper({ value, onChange, step = 0.5, min = 0, max = 16, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><Minus size={15} /></button>
      <output className="num">{fmtHours(value)}</output>
      <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><Plus size={15} /></button>
    </div>
  );
}

export function DueChip({ due, today, confirmed, atRisk }: { due: string | null; today: string; confirmed: boolean; atRisk?: boolean }) {
  if (!due) return null;
  const { text, tone } = dueLabel(due, today);
  const cls = atRisk || tone === "late" ? "chip chip-risk" : tone === "soon" ? "chip chip-soon" : "chip";
  return (
    <span className={cls + (confirmed ? "" : " chip-guess")} title={confirmed ? undefined : "Guessed deadline: confirm it in the task"}>
      {confirmed ? "" : "≈ "}{text}
    </span>
  );
}

export function repeatLabel(repeat: Repeat): string {
  if (repeat.interval === 1) return { day: "daily", week: "weekly", month: "monthly" }[repeat.unit];
  return `every ${repeat.interval} ${repeat.unit}s`;
}

export function RepeatChip({ repeat }: { repeat?: Repeat | null }) {
  if (!repeat) return null;
  return <span className="chip" title="Repeats when finished">↻ {repeatLabel(repeat)}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden="true" />;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Meter({ value, max, color = "var(--ok)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <span className="meter" role="presentation"><i style={{ width: `${pct}%`, background: color }} /></span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
