import { fromMinutes, nowIn, toMinutes } from "@theplanner/core";
import type { Config } from "./config";
import { scheduleFor } from "./plan";
import { sendToUser, type PushMessage } from "./push";
import type { Repo } from "./repo";

const fmtHours = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

/** What to send a user at this moment: the morning plan, and a heads-up before each block. */
export function dueReminders(repo: Repo, userId: string, at: Date): Array<{ key: string; message: PushMessage }> {
  const user = repo.getUser(userId);
  if (!user) return [];
  const { date, minutes } = nowIn(user.settings.timezone, at);
  const today = scheduleFor(user, repo.state(user.id), 1, at).filter(i => i.date === date);
  const out: Array<{ key: string; message: PushMessage }> = [];

  const morning = toMinutes(user.settings.morningTime);
  if (minutes >= morning && minutes < morning + 15) {
    const total = today.reduce((s, i) => s + i.minutes, 0);
    const lines = today.slice(0, 5).map(i => `${i.start} ${i.title}`);
    out.push({
      key: `morning:${date}`,
      message: {
        title: today.length ? `Today: ${fmtHours(total)} planned` : "Nothing planned today",
        body: today.length ? lines.join("\n") + (today.length > 5 ? `\n+${today.length - 5} more` : "") : "Enjoy the free day, or add a task.",
        url: "/",
        tag: "morning",
      },
    });
  }

  const lead = user.settings.remindBeforeMinutes;
  for (const item of today) {
    const remindAt = item.startMinutes - lead;
    if (minutes >= remindAt && minutes < item.startMinutes + 5) {
      out.push({
        key: `block:${date}:${item.kind}:${item.id}`,
        message: {
          title: lead > 0 && minutes < item.startMinutes ? `In ${item.startMinutes - minutes} min: ${item.title}` : `Now: ${item.title}`,
          body: `${item.start}–${fromMinutes(item.startMinutes + item.minutes)} · ${fmtHours(item.minutes)}${item.project ? ` · ${item.project}` : ""}`,
          url: "/",
          tag: `block-${item.id}`,
        },
      });
    }
  }
  return out;
}

/** Checks every minute and sends each reminder at most once. */
export function startReminderLoop(repo: Repo, config: Config): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const at = new Date();
      for (const userId of repo.listUserIdsWithPush()) {
        for (const r of dueReminders(repo, userId, at)) {
          if (repo.markReminderSent(userId, r.key)) await sendToUser(repo, config, userId, r.message);
        }
      }
      repo.pruneReminders(new Date(Date.now() - 3 * 86_400_000).toISOString());
    } catch (error) {
      console.error("Reminder loop failed:", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60_000);
  void tick();
  return () => clearInterval(timer);
}
