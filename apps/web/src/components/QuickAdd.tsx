import { parseQuickAdd } from "@theplanner/core";
import { CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtHours } from "../lib/format";
import { usePlanner } from "../lib/store";

/** One line becomes a task: "Lab report 3h due fri #Cyber !high". Press / anywhere to focus it. */
export function QuickAdd() {
  const { today, actions } = usePlanner();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(text, today), [text, today]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title || busy) return;
    setBusy(true);
    const created = await actions.createTask(
      {
        title: parsed.title,
        estimate: parsed.estimate ?? 1,
        due: parsed.due,
        priority: parsed.priority ?? 2,
        ...(parsed.project ? { projectName: parsed.project } : {}),
      },
      `Added “${parsed.title}”`,
    );
    setBusy(false);
    if (created) setText("");
  }

  const hasHints = text.trim().length > 0;
  return (
    <form className="quickadd" onSubmit={submit}>
      <label htmlFor="quickadd" className="sr-only">Add a task</label>
      <input
        id="quickadd"
        ref={input}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Add a task: Lab report 3h due fri #Cybersecurity !high"
        autoComplete="off"
        enterKeyHint="done"
      />
      {hasHints && (
        <div className="quickadd-preview" aria-live="polite">
          <span className="qa-title">{parsed.title || "Needs a title"}</span>
          <span className="chip">{fmtHours(parsed.estimate ?? 1)}{parsed.estimate === null ? " (default)" : ""}</span>
          {parsed.due && <span className="chip">due {fmtDate(parsed.due)}</span>}
          {parsed.project && <span className="chip">#{parsed.project}</span>}
          {parsed.priority === 3 && <span className="chip chip-soon">high priority</span>}
          {parsed.priority === 1 && <span className="chip">low priority</span>}
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={!parsed.title || busy}>
        <CornerDownLeft size={16} aria-hidden="true" /> Add
      </button>
    </form>
  );
}
