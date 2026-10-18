import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors());
app.use(express.json());

const starterData = {
  settings: { hoursPerDay: 3, startDate: new Date().toISOString().slice(0, 10) },
  tasks: [
    { id: "sample-1", title: "Web Stack assignment", course: "Web Stack", dueDate: addDays(2), hours: 4, priority: "High" },
    { id: "sample-2", title: "C programming practice", course: "Programming in C", dueDate: addDays(3), hours: 2, priority: "Medium" },
    { id: "sample-3", title: "Prepare presentation slides", course: "Communication", dueDate: addDays(4), hours: 3, priority: "High" },
    { id: "sample-4", title: "Revise JavaScript basics", course: "Web Stack", dueDate: addDays(5), hours: 2, priority: "Low" }
  ]
};

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(starterData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Could not read data.json:", error);
    return structuredClone(starterData);
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function validTask(task) {
  return task &&
    typeof task.title === "string" && task.title.trim().length > 0 &&
    typeof task.dueDate === "string" && !Number.isNaN(Date.parse(task.dueDate)) &&
    Number.isFinite(Number(task.hours)) && Number(task.hours) > 0 && Number(task.hours) <= 200 &&
    ["Low", "Medium", "High"].includes(task.priority);
}

app.get("/api/health", (_req, res) => res.json({ ok: true, message: "Deadline Domino API is running" }));

app.get("/api/tasks", (_req, res) => {
  const data = readData();
  res.json({ tasks: data.tasks, settings: data.settings });
});

app.post("/api/tasks", (req, res) => {
  const incoming = req.body;
  if (!validTask(incoming)) {
    return res.status(400).json({ error: "Enter a title, valid due date, positive hours (up to 200), and priority." });
  }
  const data = readData();
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    title: incoming.title.trim(),
    course: String(incoming.course || "General").trim().slice(0, 60) || "General",
    dueDate: incoming.dueDate,
    hours: Number(incoming.hours),
    priority: incoming.priority
  };
  data.tasks.push(task);
  writeData(data);
  res.status(201).json({ task });
});

app.delete("/api/tasks/:id", (req, res) => {
  const data = readData();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(task => task.id !== req.params.id);
  if (before === data.tasks.length) return res.status(404).json({ error: "Task not found." });
  writeData(data);
  res.json({ ok: true });
});

app.put("/api/settings", (req, res) => {
  const hoursPerDay = Number(req.body.hoursPerDay);
  const startDate = String(req.body.startDate || "");
  if (!Number.isFinite(hoursPerDay) || hoursPerDay < 1 || hoursPerDay > 16 || Number.isNaN(Date.parse(startDate))) {
    return res.status(400).json({ error: "Daily study hours must be between 1 and 16 and start date must be valid." });
  }
  const data = readData();
  data.settings = { hoursPerDay, startDate };
  writeData(data);
  res.json({ settings: data.settings });
});

function dateOnly(dateString) {
  return new Date(`${dateString}T12:00:00`);
}
function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function daysBetween(start, end) {
  return Math.round((dateOnly(end) - dateOnly(start)) / 86400000);
}

/*
  Scheduling approach:
  1. Create one capacity bucket per day, starting at startDate.
  2. Sort tasks by earliest deadline, then priority.
  3. For each task, allocate its hours backwards from its deadline.
  4. A day can hold at most hoursPerDay study hours.
  5. Any remaining hours become unscheduled work and are marked at risk.
  This is a transparent heuristic, not an optimal solver.
*/
function buildSchedule(tasks, settings, delay = null) {
  const startDate = settings.startDate || new Date().toISOString().slice(0, 10);
  const hoursPerDay = Number(settings.hoursPerDay) || 3;
  const normalized = tasks.map(task => ({
    ...task,
    effectiveDueDate: task.dueDate,
    readyDate: delay && task.id === delay.taskId
      ? isoDate(new Date(dateOnly(startDate).getTime() + delay.days * 86400000))
      : startDate
  }));

  const latestDue = normalized.reduce((latest, task) => task.effectiveDueDate > latest ? task.effectiveDueDate : latest, startDate);
  const daysToCreate = Math.max(7, Math.min(90, daysBetween(startDate, latestDue) + 1));
  const days = [];
  for (let i = 0; i < daysToCreate; i++) {
    const d = dateOnly(startDate);
    d.setDate(d.getDate() + i);
    days.push({ date: isoDate(d), capacity: hoursPerDay, plannedHours: 0, items: [] });
  }

  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const sorted = [...normalized].sort((a, b) =>
    a.effectiveDueDate.localeCompare(b.effectiveDueDate) ||
    priorityRank[a.priority] - priorityRank[b.priority]
  );
  const results = [];

  for (const task of sorted) {
    let remaining = Number(task.hours);
    const deadlineIndex = days.findIndex(day => day.date === task.effectiveDueDate);
    const lastIndex = deadlineIndex === -1
      ? (task.effectiveDueDate < startDate ? -1 : days.length - 1)
      : deadlineIndex;
    const allocated = [];
    const readyIndex = days.findIndex(day => day.date >= task.readyDate);
    const earliestIndex = readyIndex === -1 ? days.length : readyIndex;
    for (let i = lastIndex; i >= earliestIndex && remaining > 0; i--) {
      const day = days[i];
      const free = Math.max(0, day.capacity - day.plannedHours);
      if (free <= 0) continue;
      const amount = Math.min(free, remaining);
      day.plannedHours += amount;
      day.items.push({ taskId: task.id, title: task.title, hours: amount, priority: task.priority });
      allocated.push({ date: day.date, hours: amount });
      remaining = Math.round((remaining - amount) * 100) / 100;
    }
    const overdue = task.effectiveDueDate < startDate;
    results.push({
      ...task,
      allocated: allocated.reverse(),
      unscheduledHours: remaining,
      overdue,
      atRisk: remaining > 0 || overdue
    });
  }

  const dayMap = days.map(day => ({
    ...day,
    freeHours: Math.max(0, day.capacity - day.plannedHours),
    loadPercent: Math.min(100, Math.round((day.plannedHours / day.capacity) * 100)),
    overloaded: day.plannedHours > day.capacity
  }));

  return {
    startDate,
    hoursPerDay,
    days: dayMap,
    tasks: results,
    totalHours: normalized.reduce((sum, task) => sum + Number(task.hours), 0),
    unscheduledHours: results.reduce((sum, task) => sum + task.unscheduledHours, 0),
    atRiskCount: results.filter(task => task.atRisk).length
  };
}

app.post("/api/schedule", (req, res) => {
  const data = readData();
  res.json({ schedule: buildSchedule(data.tasks, data.settings) });
});

app.post("/api/simulate", (req, res) => {
  const data = readData();
  const taskId = String(req.body.taskId || "");
  const days = Math.max(1, Math.min(14, Number(req.body.days) || 1));
  if (!data.tasks.some(task => task.id === taskId)) return res.status(404).json({ error: "Choose a task to delay." });
  const original = buildSchedule(data.tasks, data.settings);
  const simulated = buildSchedule(data.tasks, data.settings, { taskId, days });
  res.json({
    taskId,
    delayDays: days,
    original: {
      atRiskCount: original.atRiskCount,
      unscheduledHours: original.unscheduledHours,
      tasks: original.tasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, atRisk: t.atRisk, unscheduledHours: t.unscheduledHours }))
    },
    simulated: {
      atRiskCount: simulated.atRiskCount,
      unscheduledHours: simulated.unscheduledHours,
      tasks: simulated.tasks.map(t => ({ id: t.id, title: t.title, dueDate: t.effectiveDueDate, atRisk: t.atRisk, unscheduledHours: t.unscheduledHours }))
    },
    schedule: simulated
  });
});

app.listen(PORT, () => {
  console.log(`Deadline Domino API running at http://localhost:${PORT}`);
});
