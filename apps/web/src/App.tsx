import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { TaskEditorProvider } from "./components/TaskEditor";
import { ApiError } from "./lib/api";
import { PlannerProvider, useAppState } from "./lib/store";
import { AuthPage } from "./pages/Auth";
import { InsightsPage } from "./pages/Insights";
import { SettingsPage } from "./pages/Settings";
import { TasksPage } from "./pages/Tasks";
import { TodayPage } from "./pages/Today";
import { WeekPage } from "./pages/Week";

function SignedIn() {
  const { data, error, isPending, refetch } = useAppState();
  if (isPending) return <div className="boot"><img src="/icon.svg" alt="" width={40} height={40} /><span>Loading your plan…</span></div>;
  if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />;
  if (error || !data) {
    return (
      <div className="boot">
        <p>{error instanceof ApiError ? error.message : "Your plan couldn't be loaded."}</p>
        <button className="btn" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }
  return (
    <PlannerProvider state={data}>
      <TaskEditorProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/week" element={<WeekPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </TaskEditorProvider>
    </PlannerProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/*" element={<SignedIn />} />
    </Routes>
  );
}
