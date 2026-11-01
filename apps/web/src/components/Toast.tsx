import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "error";
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((message: string, tone: Tone = "info") => {
    clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 5000 : 2500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div key={toast.id} className={`toast toast-${toast.tone}`}>{toast.message}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
