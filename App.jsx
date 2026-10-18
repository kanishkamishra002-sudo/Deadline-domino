import { useEffect, useMemo, useState } from "react";

const API = "http://localhost:3001/api";
const blankTask = {
  title: "",
  course: "",
  dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  hours: "2",
  priority: "Medium"
};

function prettyDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short"
  });
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ hoursPerDay: 3, startDate: new Date().toISOString().slice(0, 10) });
  const [schedule, setSchedule] = useState(null);
  const [newTask, setNewTask] = useState(blankTask);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [delayDays, setDelayDays] = useState("1");
  const [activeTab, setActiveTab] = useState("plan");

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/tasks");
      setTasks(data.tasks);
      setSettings(data.settings);
      setSelectedTaskId(current => data.tasks.some(t => t.id === current) ? current : (data.tasks[0]?.id || ""));
      const result = await request("/schedule", { method: "POST", body: JSON.stringify({}) });
      setSchedule(result.schedule);
    } catch {
      setError("Can't connect to the backend. Make sure you ran `npm run dev` in the project folder.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function addTask(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await request("/tasks", { method: "POST", body: JSON.stringify(newTask) });
      setNewTask({ ...blankTask, dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) });
      setNotice("Task added. Your plan has been recalculated.");
      setSimulation(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(id) {
    try {
      await request(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      setNotice("Task removed.");
      setSimulation(null);
      await refresh();
    } catch (e) { setError(e.message); }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(data.settings);
      const result = await request("/schedule", { method: "POST", body: JSON.stringify({}) });
      setSchedule(result.schedule);
      setSimulation(null);
      setNotice("Study capacity updated.");
    } catch (e) { setError(e.message); }
  }

  async function runSimulation(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const result = await request("/simulate", {
        method: "POST",
        body: JSON.stringify({ taskId: selectedTaskId, days: Number(delayDays) })
      });
      setSimulation(result);
      setActiveTab("simulation");
    } catch (e) { setError(e.message); }
  }

  const totalHours = useMemo(() => tasks.reduce((sum, task) => sum + Number(task.hours), 0), [tasks]);
  const riskTasks = schedule?.tasks.filter(task => task.atRisk) || [];
  const busyDays = schedule?.days.filter(day => day.plannedHours >= day.capacity && day.plannedHours > 0).length || 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>DD</span></div>
          <div><strong>deadline<span>domino</span></strong><small>STUDENT WORKLOAD LAB</small></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${activeTab === "plan" ? "selected" : ""}`} onClick={() => setActiveTab("plan")}><span>◫</span> Workload overview</button>
        <button className={`nav-item ${activeTab === "simulation" ? "selected" : ""}`} onClick={() => setActiveTab("simulation")}><span>⤴</span> Delay simulator</button>
        <div className="sidebar-note">
          <div className="note-icon">✳</div>
          <strong>Small delays. Big ripples.</strong>
          <p>Plan your hours before deadlines start colliding.</p>
        </div>
        <div className="sidebar-bottom"><span className="status-dot"></span> LOCAL PLANNER <span className="version">v1.0</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><div className="eyebrow">YOUR PERSONAL WORKLOAD LAB</div><h1>Make room for what matters.</h1><p className="subtitle">See deadline pressure before it becomes a problem.</p></div>
          <div className="today-chip"><span className="live-dot"></span> PLANNING MODE <span className="chip-divider">/</span> {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).toUpperCase()}</div>
        </header>

        {error && <div className="alert error-alert"><strong>Heads up:</strong> {error}</div>}
        {notice && <div className="alert success-alert"><strong>✓</strong> {notice}</div>}

        {loading ? <div className="loading-panel">Connecting to your planner<span className="loading-dots">...</span></div> : (
          <>
            <section className="metrics-grid">
              <Metric label="TASK HOURS" value={`${totalHours}h`} detail="Total estimated workload" symbol="◷" />
              <Metric label="DAILY CAPACITY" value={`${settings.hoursPerDay}h`} detail="Study time available / day" symbol="↗" />
              <Metric label="FULL DAYS" value={busyDays} detail="Days with no spare capacity" symbol="▦" />
              <Metric label="TASKS AT RISK" value={riskTasks.length} detail="Need a closer look" symbol="!" warning={riskTasks.length > 0} />
            </section>

            <div className="section-heading">
              <div><div className="eyebrow">THE BIG PICTURE</div><h2>Workload forecast</h2></div>
              <div className="legend"><span><i className="legend-dot light"></i> Room available</span><span><i className="legend-dot medium"></i> Almost full</span><span><i className="legend-dot heavy"></i> At capacity</span></div>
            </div>

            <section className="panel forecast-panel">
              <div className="panel-topline"><div><strong>Daily capacity map</strong><p>Planned study hours compared with your daily limit</p></div><span className="pill">{schedule?.days.length || 0} DAY WINDOW</span></div>
              <div className="heatmap">
                {schedule?.days.slice(0, 14).map(day => {
                  const level = day.plannedHours === 0 ? "empty" : day.loadPercent < 55 ? "light" : day.loadPercent < 100 ? "medium" : "heavy";
                  return <div className="heat-cell-wrap" key={day.date} title={`${prettyDate(day.date)}: ${day.plannedHours} of ${day.capacity} hours planned`}>
                    <div className={`heat-cell ${level}`}><strong>{day.plannedHours}h</strong><span>{day.loadPercent}%</span></div>
                    <span className="heat-date">{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}</span>
                    <span className="heat-number">{new Date(`${day.date}T12:00:00`).getDate()}</span>
                  </div>;
                })}
              </div>
              <div className="heatmap-foot"><span><span className="status-dot"></span> Capacity is capped at {settings.hoursPerDay} hours/day</span><span>Schedule uses deadline-first allocation</span></div>
            </section>

            <div className="content-grid">
              <section className="panel tasks-panel">
                <div className="panel-topline"><div><strong>Task runway</strong><p>What needs your attention first</p></div><span className="pill">{tasks.length} TASKS</span></div>
                {tasks.length === 0 ? <div className="empty-state">No tasks yet. Add your first task using the form.</div> :
                  <div className="task-list">
                    {[...(schedule?.tasks || [])].sort((a, b) => a.effectiveDueDate.localeCompare(b.effectiveDueDate)).map(task => (
                      <div className="task-row" key={task.id}>
                        <div className={`priority-bar ${task.priority.toLowerCase()}`}></div>
                        <div className="task-main"><div className="task-title">{task.title}</div><div className="task-meta">{task.course || "General"} <span>·</span> {task.hours}h estimated <span>·</span> Due {prettyDate(task.effectiveDueDate)}</div>
                          {task.atRisk && <div className="risk-message">⚠ {task.overdue ? "Deadline has passed" : `${task.unscheduledHours}h cannot fit before deadline`}</div>}
                        </div>
                        <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
                        <button className="icon-button" title="Delete task" onClick={() => removeTask(task.id)}>×</button>
                      </div>
                    ))}
                  </div>
                }
                <div className="panel-bottom"><span className="tiny-dot"></span> Tasks are saved in your local project data file.</div>
              </section>

              <section className="panel settings-panel">
                <div className="panel-topline"><div><strong>Your daily capacity</strong><p>Tell the planner what is realistic</p></div><span className="settings-icon">⚙</span></div>
                <form onSubmit={saveSettings} className="settings-form">
                  <label>PLANNING START DATE<input type="date" value={settings.startDate} onChange={e => setSettings({ ...settings, startDate: e.target.value })} required /></label>
                  <label>AVAILABLE STUDY HOURS / DAY<div className="capacity-control"><input type="range" min="1" max="10" value={settings.hoursPerDay} onChange={e => setSettings({ ...settings, hoursPerDay: Number(e.target.value) })} /><strong>{settings.hoursPerDay}<small>hrs</small></strong></div></label>
                  <button className="primary-button" type="submit">Recalculate plan <span>↗</span></button>
                </form>
                <div className="tip-box"><span>✦</span><p><strong>Planner tip</strong> Keep your daily hours realistic. A plan that leaves breathing room is more useful than a perfect-looking impossible schedule.</p></div>
              </section>
            </div>

            <section className="panel add-panel">
              <div className="panel-topline"><div><div className="eyebrow">ADD A NEW COMMITMENT</div><strong>Put a task on the runway</strong><p>Estimate the work, choose the deadline, then see where it fits.</p></div><div className="add-symbol">＋</div></div>
              <form className="task-form" onSubmit={addTask}>
                <label>TASK NAME<input placeholder="e.g. Build React assignment" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} maxLength="100" required /></label>
                <label>SUBJECT / COURSE<input placeholder="e.g. Web Stack" value={newTask.course} onChange={e => setNewTask({ ...newTask, course: e.target.value })} maxLength="60" /></label>
                <label>DUE DATE<input type="date" value={newTask.dueDate} onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} required /></label>
                <label>ESTIMATED HOURS<input type="number" min="0.5" max="200" step="0.5" value={newTask.hours} onChange={e => setNewTask({ ...newTask, hours: e.target.value })} required /></label>
                <label>PRIORITY<select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
                <button className="primary-button add-button" disabled={busy}>{busy ? "Adding..." : "＋ Add task"}</button>
              </form>
            </section>

            <section className="panel simulation-panel">
              <div className="panel-topline"><div><div className="eyebrow">WHAT-IF LAB</div><strong>Trigger a deadline domino</strong><p>Pretend work on one task starts late and see whether it still fits before its deadline.</p></div><div className="simulation-glyph">↝</div></div>
              <form className="simulation-form" onSubmit={runSimulation}>
                <label>WHICH TASK GETS DELAYED?<select value={selectedTaskId} onChange={e => setSelectedTaskId(e.target.value)} required disabled={tasks.length === 0}><option value="">Choose a task</option>{tasks.map(task => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
                <label>DELAY BY<select value={delayDays} onChange={e => setDelayDays(e.target.value)}><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="5">5 days</option></select></label>
                <button className="dark-button" disabled={tasks.length === 0}>Run simulation <span>↗</span></button>
              </form>
              {simulation && <div className="simulation-result">
                <div className="result-head"><strong>Simulation results</strong><span className="pill">NOT SAVED TO YOUR PLAN</span></div>
                <div className="result-stats">
                  <div><span>Tasks at risk</span><strong>{simulation.original.atRiskCount} <i>→</i> {simulation.simulated.atRiskCount}</strong></div>
                  <div><span>Hours that don't fit</span><strong>{simulation.original.unscheduledHours}h <i>→</i> {simulation.simulated.unscheduledHours}h</strong></div>
                </div>
                <p className="simulation-note">This is a what-if scenario only. The selected task starts later in the simulation; your saved task and deadline are unchanged.</p>
                <div className="change-list">{simulation.simulated.tasks.filter(t => {
                  const old = simulation.original.tasks.find(o => o.id === t.id);
                  return old && (old.atRisk !== t.atRisk || old.unscheduledHours !== t.unscheduledHours || old.dueDate !== t.dueDate);
                }).map(t => <div className="change-row" key={t.id}><span>{t.title}</span><span>{t.atRisk ? "At risk" : "Looks schedulable"} · due {prettyDate(t.dueDate)}</span></div>)}
                  {simulation.simulated.tasks.every(t => {
                    const old = simulation.original.tasks.find(o => o.id === t.id);
                    return old && old.atRisk === t.atRisk && old.unscheduledHours === t.unscheduledHours && old.dueDate === t.dueDate;
                  }) && <p className="simulation-note">No risk status changed in this scenario. Try a longer delay or adjust your capacity.</p>}
                </div>
              </div>}
            </section>
            <footer><span>DEADLINE DOMINO</span><span>Built for realistic planning, not perfect predictions.</span><span>React · Express · JSON storage</span></footer>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value, detail, symbol, warning }) {
  return <div className={`metric-card ${warning ? "metric-warning" : ""}`}><div className="metric-top"><span>{label}</span><i>{symbol}</i></div><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></div>;
}

export default App;
