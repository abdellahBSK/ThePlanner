/** A date as YYYY-MM-DD, in the user's own time zone. */
export type IsoDate = string;

/** Hours logged per date, e.g. { "2026-11-02": 1.5 }. */
export type WorkLog = Record<IsoDate, number>;

export type TaskStatus = "todo" | "waiting" | "done";
export type Priority = 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  /** Total hours the task should take. */
  estimate: number;
  due: IsoDate | null;
  /** False while the deadline is only a guess. */
  dueConfirmed: boolean;
  priority: Priority;
  status: TaskStatus;
  /** Do not schedule before this date. */
  notBefore: IsoDate | null;
  notes: string;
  link: string;
  log: WorkLog;
  createdAt: string;
  doneAt: string | null;
}

export interface Habit {
  id: string;
  title: string;
  minutes: number;
  /** Weekdays, 0 = Sunday. */
  days: number[];
  link: string;
  active: boolean;
  log: WorkLog;
}

export interface Project {
  id: string;
  name: string;
  color: string;
}

export interface Settings {
  /** Hours available per weekday, index 0 = Sunday. */
  weekdayHours: number[];
  /** Time the work day starts per weekday, "HH:MM". */
  dayStart: string[];
  /** Hours for specific dates, overriding the weekday default. */
  overrides: Record<IsoDate, number>;
  maxPerTaskPerDay: number;
  breakMinutes: number;
  morningTime: string;
  remindBeforeMinutes: number;
  timezone: string;
}

export interface Block {
  taskId: string;
  hours: number;
}

export interface DayPlan {
  date: IsoDate;
  /** Hours available that day. */
  capacity: number;
  /** Hours taken by habits that day. */
  habitHours: number;
  /** Hours left unplanned. */
  free: number;
  blocks: Block[];
}

export interface Plan {
  days: DayPlan[];
  /** Date each task finishes, or null if it doesn't fit in the horizon. */
  finish: Record<string, IsoDate | null>;
  /** Tasks that won't be finished by their deadline. */
  atRisk: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  weekdayHours: [4, 3, 3, 3, 3, 3, 5],
  dayStart: ["10:00", "18:00", "18:00", "18:00", "18:00", "18:00", "10:00"],
  overrides: {},
  maxPerTaskPerDay: 3,
  breakMinutes: 10,
  morningTime: "08:00",
  remindBeforeMinutes: 5,
  timezone: "UTC",
};
