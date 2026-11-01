import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarDays, ListChecks, LogOut, Settings2, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { usePlanner } from "../lib/store";
import { QuickAdd } from "./QuickAdd";

const NAV = [
  { to: "/", label: "Today", icon: Sun, end: true },
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function Shell({ children }: { children: ReactNode }) {
  const { state, plan } = usePlanner();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const atRisk = plan.atRisk.length;

  async function logout() {
    await api.logout().catch(() => {});
    qc.clear();
    navigate("/login");
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span>ThePlanner</span>
        </div>
        <nav aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {to === "/tasks" && atRisk > 0 && <span className="badge" title={`${atRisk} deadline${atRisk > 1 ? "s" : ""} at risk`}>{atRisk}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="who" title={state.user.email}>{state.user.name}</span>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar"><QuickAdd /></div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
