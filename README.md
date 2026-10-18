# Deadline Domino

A student workload planning prototype built with React, Express and JSON file storage.

## Features
- Add and remove tasks with due date, estimated hours, course and priority.
- Set planning start date and available study hours per day.
- Build a daily capacity map (heatmap).
- Flag tasks with hours that cannot fit before their deadline.
- Simulate starting one task late without changing saved data or its deadline.
- Persist tasks and settings in `server/data.json`.

## Requirements
- Node.js 18 or newer (Node.js 20 LTS recommended)
- npm (installed with Node.js)

## Run on Windows
1. Extract the ZIP.
2. Open the `deadline-domino` folder.
3. In File Explorer's address bar type `cmd` and press Enter.
4. Run:
   ```bash
   npm install
   npm run dev
   ```
5. Open `http://localhost:5173` in your browser.
6. The backend API runs at `http://localhost:3001/api/health`.

Keep the terminal running while using the app. Press `Ctrl+C` to stop both processes.

## How the scheduler works
The backend creates a daily capacity bucket. It sorts tasks by earliest due date and then by priority. For each task it allocates hours backwards from its due date into days with remaining capacity. Hours that cannot be placed are marked at risk. This is a transparent heuristic and is not guaranteed to find the globally optimal schedule.

## Data storage
Tasks and settings are stored in `server/data.json`. This is suitable for a local demo, not a multi-user production application. Do not place sensitive personal information in it.

## API endpoints
- `GET /api/health` — server health
- `GET /api/tasks` — tasks and settings
- `POST /api/tasks` — create task
- `DELETE /api/tasks/:id` — delete task
- `PUT /api/settings` — update study capacity
- `POST /api/schedule` — calculate schedule
- `POST /api/simulate` — simulate starting a task late

## Interview talking points
- React components and state
- REST API requests with `fetch`
- Express routes and input validation
- JSON file persistence
- Greedy, deadline-first scheduling heuristic
- Simulation by recalculating with a temporary earliest-start-date change
- Limitations and next steps: automated tests, better scheduling optimization, user accounts, database, timezone-aware dates
