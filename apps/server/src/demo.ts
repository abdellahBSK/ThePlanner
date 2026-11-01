import { addDays, nowIn } from "@theplanner/core";
import { transaction, type Db } from "./db";
import type { Repo, User } from "./repo";

/** A realistic example semester, so a new user sees the planner working right away. */
export function loadDemo(db: Db, repo: Repo, user: User): void {
  const today = nowIn(user.settings.timezone).date;
  const inDays = (n: number) => addDays(today, n);
  transaction(db, () => {
    const p = (name: string, color: string) => repo.findProjectByName(user.id, name) ?? repo.createProject(user.id, { name, color });
    const ai = p("AI course", "#4f7cff");
    const bigdata = p("Big Data", "#8b5cf6");
    const cyber = p("Cybersecurity", "#ef4f6b");
    const portfolio = p("Portfolio", "#f59e0b");

    const t = (title: string, projectId: string, estimate: number, due: string | null, priority: 1 | 2 | 3, notes = "") =>
      repo.createTask(user.id, { title, projectId, estimate, due, dueConfirmed: true, priority, status: "todo", notBefore: null, notes, link: "" });

    t("TP1: churn prediction with a decision tree", ai.id, 5, inDays(5), 3, "build.ipynb and run.ipynb; predictions in churn_pred.csv");
    t("TP2: neural network on Iris with Keras", ai.id, 4, inDays(10), 2);
    t("Set up a 4-node Hadoop cluster", bigdata.id, 3, inDays(3), 3, "Format HDFS, start master and slaves, check the YARN UI");
    t("Spark cluster lab", bigdata.id, 3, inDays(14), 2);
    t("Lab 3: network attack analysis", cyber.id, 4, inDays(4), 3);
    t("Write the portfolio README with screenshots", portfolio.id, 2, inDays(7), 2);
    t("Add unit tests and CI to the side project", portfolio.id, 3, inDays(12), 1);
    t("Deploy a live demo", portfolio.id, 2.5, null, 1);

    repo.createHabit(user.id, { title: "Problem solving, timed", minutes: 45, days: [1, 2, 3, 4, 5, 6], link: "https://neetcode.io/practice", active: true });
    repo.createHabit(user.id, { title: "Mock live-coding interview", minutes: 60, days: [0], link: "", active: true });
  });
}
