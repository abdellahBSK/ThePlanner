# Daily routines

Two scheduled routines run every day and read the planner's database. Both reuse the scheduler from the published page (the code between `// FOCUS-SCHEDULER-START` and `// FOCUS-SCHEDULER-END`), so the calendar, the notifications and the page always agree on the plan.

| Routine | When (Africa/Casablanca) | Writes |
| --- | --- | --- |
| Morning plan | 07:52 every day | Calendar blocks for today; new ILISI3 tasks; `config/main.templateLastSha` |
| Evening check-in | 21:17 every day | Nothing (read only) |

## Morning plan

1. Read today's date in Africa/Casablanca.
2. Load every document in `tasks` and the `config/main` document.
3. Extract the scheduler from the published page and compute `buildPlan(tasks, config, today, 42)`. Today's work is `habitsOn(tasks, today)` followed by `plan.days[0].blocks`.
4. **New coach assignments.** Compare the head of `klaghmari-github/ILISI3` with `config.templateLastSha`. For each TP folder with new or changed instructions that no task covers yet, create a task (project `ILISI3`, category `course`, estimate 3 h, due in 7 days, deadline marked as estimated, high priority). A task in `waiting` status whose instructions are now published moves to `todo`. Save the new commit id in `templateLastSha`.
5. **Google Calendar.** Delete today's events whose description contains `[focus-board]` (so a rerun never duplicates them), then place today's work in order from `config.dayStart[weekday]` (or now, if later), skipping existing events, with 10 minutes between blocks and nothing after 23:30. Each event gets a 5-minute popup reminder.
6. **Notification.** A short summary: total hours, one line per block with its time, deadlines at risk, new assignments, and the planner link.

## Evening check-in

1. Load the tasks and settings, and compute today's plan as of the start of the day.
2. A block counts as done when its task is finished or the hours logged today reach the block's hours; a habit when anything is logged today.
3. **Notification.** What got done, each unfinished item with logged vs planned hours, tomorrow's first three blocks, deadlines at risk, and the planner link. Unfinished work needs no action: the scheduler moves it to the next days by itself.

## Database

| Path | Contents |
| --- | --- |
| `tasks/<id>` | A task (`kind: "task"`) or a habit (`kind: "habit"`) |
| `config/main` | Hours per weekday, per-date overrides, start times, cap per task per day, reminder times, last seen template commit |

### Task fields

| Field | Meaning |
| --- | --- |
| `title`, `project`, `category` | What it is; category is `course`, `lab`, `portfolio`, `interview` or `career` |
| `estimate` | Hours of work in total |
| `due`, `dueEstimated` | Deadline (`YYYY-MM-DD`) and whether it is a guess |
| `priority` | 3 high, 2 normal, 1 low; breaks ties between equal deadlines |
| `status` | `todo` (scheduled), `waiting` (not scheduled yet) or `done` |
| `log` | Hours logged per date, e.g. `{"2026-11-01": 1.5}` |
| `notBefore` | Optional: do not schedule before this date |
| `minutes`, `days` | Habits only: length and weekdays (0 = Sunday) |
