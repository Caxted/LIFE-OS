import { initAuth } from './auth.js';
import { systems, insightMessages } from './config.js';
import { DataManager, formatDateKey } from './data.js';

const root = document.documentElement;
let currentLogs = {};
const todayKey = formatDateKey(new Date());

document.addEventListener("DOMContentLoaded", async () => {
  // Init Auth - Fail gracefully so UI still loads
  try {
    initAuth();
  } catch (e) {
    console.error("Auth failed to init:", e);
  }

  setTodayDate();
  // Theme is now enforced in CSS

  // Load Data & Subscribe
  try {
    currentLogs = await DataManager.load(todayKey);
    // Subscribe to real-time changes
    DataManager.subscribe(todayKey, (newLogs) => {
      console.log("Remote update received", newLogs);
      currentLogs = newLogs;
      // Refresh UI
      initCheckin();
      updateDayScore();
      showToast("Synced with cloud", "success");
    });
  } catch (e) {
    console.error("Failed to load today's logs", e);
  }

  // Load Systems (Custom Habits)
  let userSystems = [];
  try {
    userSystems = await SystemsManager.load();
  } catch (e) {
    console.error("Failed to load systems", e);
    userSystems = systems; // fallback to config
  }

  initCheckin(userSystems); // Uses currentLogs & userSystems

  // Reveal UI immediately so user sees structure
  revealCards();

  // Generate Stats
  let history = {};
  try {
    history = await DataManager.getHistory(365); // Fetch full year
  } catch (e) {
    console.error("Failed to load history", e);
  }

  // Monthly uses last 30 days
  const today = new Date();
  const monthlyKeys = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    monthlyKeys.push(formatDateKey(d));
  }

  const monthlyScores = monthlyKeys.map(k => calculateScore(history[k])).reverse();
  const recentHistory = {};
  monthlyKeys.forEach(k => recentHistory[k] = history[k]);

  renderLineChart(monthlyScores);
  renderHeatmap(recentHistory); // Maintain monthly view as is
  renderCategoryDonut(recentHistory);
  updateOverviewStats(monthlyScores);
  updateAnalytics(monthlyScores);
  setInsight(history);

  updateCountdown();

  const clearBtn = document.getElementById('clearDataBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to generic reset all LOCAL data? This cannot be undone.")) {
        localStorage.clear();
        window.location.reload();
      }
    });
  }
});

function calculateScore(logs) {
  if (!logs) return 0;
  // Use dynamic systems list length
  const total = document.querySelectorAll('.checkin-item').length || systems.length;
  let done = 0;
  // We need to iterate over the keys in logs that match active systems
  // For simplicity in this version, we count 'done' flags.
  Object.values(logs).forEach(val => {
    if (val.done) done++;
  });

  return Math.round((done / total) * 100);
}

function setTodayDate() {
  const todayEl = document.getElementById("todayDate");
  if (!todayEl) return;
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  todayEl.textContent = formatted;
}




async function initCheckin(userSystems) {
  // If systems are passed, re-render the list
  if (userSystems) {
    renderCheckinList(userSystems);
  }

  // Re-select toggles after render
  const toggles = Array.from(document.querySelectorAll(".toggle"));

  toggles.forEach((toggle) => {
    const item = toggle.closest('.checkin-item');
    const sysId = item.dataset.system;

    // Set initial state
    const isDone = currentLogs[sysId]?.done || false;
    setToggle(toggle, isDone);

    // Set initial note
    const note = currentLogs[sysId]?.note || "";
    const textarea = item.querySelector('textarea');
    if (textarea) textarea.value = note;

    // Remove old listeners to prevent duplicates if re-init
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);

    newToggle.addEventListener("click", async () => {
      const next = newToggle.getAttribute("aria-checked") !== "true";
      setToggle(newToggle, next);

      // Update State
      if (!currentLogs[sysId]) currentLogs[sysId] = {};
      currentLogs[sysId].done = next;

      await DataManager.save(todayKey, currentLogs);
      // showToast("Saved", "success"); // Optional: too chatty?

      updateDayScore();
    });

    if (textarea) {
      const newTextarea = textarea.cloneNode(true);
      textarea.parentNode.replaceChild(newTextarea, textarea);

      newTextarea.addEventListener('blur', async () => {
        const val = newTextarea.value;
        if (!currentLogs[sysId]) currentLogs[sysId] = {};
        currentLogs[sysId].note = val;
        await DataManager.save(todayKey, currentLogs);
      });
    }
  });

  // Re-attach note toggles
  document.querySelectorAll(".note-toggle").forEach((button) => {
    const newBtn = button.cloneNode(true);
    button.parentNode.replaceChild(newBtn, button);

    newBtn.addEventListener("click", () => {
      const item = newBtn.closest(".checkin-item");
      if (!item) return;
      item.classList.toggle("note-open");
      const open = item.classList.contains("note-open");
      newBtn.textContent = open ? "Hide note" : "Add note";
      if (open) {
        const textarea = item.querySelector("textarea");
        if (textarea) textarea.focus();
      }
    });
  });

  updateDayScore();
}

function renderCheckinList(userSystems) {
  const container = document.querySelector('.checkin-list');
  if (!container) return;
  container.innerHTML = '';

  userSystems.forEach(sys => {
    const item = document.createElement('div');
    item.className = 'checkin-item';
    item.dataset.system = sys.id;

    // Icon mapping (fallback to 'skill' if not found or custom)
    // For simplicity, we assume custom habits use a generic icon or we'd need an icon picker.
    // We'll stick to fixed icons for default IDs, generic for others.
    const iconId = ['gym', 'sleep', 'study', 'food', 'water', 'money', 'healthy', 'social', 'love', 'content', 'productivity'].includes(sys.id)
      ? `icon-${sys.id === 'new-skill' ? 'skill' : sys.id}`
      : 'icon-skill';

    item.innerHTML = `
            <div class="item-left">
              <svg class="icon" aria-hidden="true">
                <use href="#${iconId}" />
              </svg>
              <div class="item-text">
                <div class="item-title">${sys.label}</div>
                <button class="note-toggle" type="button">Add note</button>
              </div>
            </div>
            <button class="toggle" role="switch" aria-checked="false" aria-label="${sys.label}">
              <span class="toggle-thumb"></span>
            </button>
            <div class="note">
              <textarea rows="2" placeholder="Optional note..."></textarea>
            </div>
        `;
    container.appendChild(item);
  });
}

function setToggle(toggle, isOn) {
  toggle.setAttribute("aria-checked", isOn ? "true" : "false");
  toggle.classList.toggle("is-on", isOn);
  const item = toggle.closest(".checkin-item");
  if (item) item.classList.toggle("is-on", isOn);
}

function updateDayScore() {
  const toggles = Array.from(document.querySelectorAll(".toggle"));
  const done = toggles.filter((t) => t.getAttribute("aria-checked") === "true").length;
  const total = toggles.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const completionEl = document.getElementById("completionPercent");
  const dayScoreEl = document.getElementById("dayScore");
  const todayPercentEl = document.getElementById("todayPercent");
  const messageEl = document.getElementById("dayMessage");
  const completedEl = document.getElementById("ringCompleted");
  const remainingEl = document.getElementById("ringRemaining");

  if (completionEl) completionEl.textContent = `${percent}%`;
  if (dayScoreEl) dayScoreEl.textContent = `${percent}%`;
  if (todayPercentEl) todayPercentEl.textContent = `${percent}%`;
  if (completedEl) completedEl.textContent = done;
  if (remainingEl) remainingEl.textContent = total - done;

  if (messageEl) {
    const message = percent >= 80
      ? "You showed up today."
      : percent >= 60
        ? "Steady and honest progress."
        : percent >= 40
          ? "Data before judgment."
          : "A quiet reset is still progress.";
    messageEl.textContent = message;
  }

  const ring = document.getElementById("todayRing");
  if (ring) setRing(ring, percent);
}

function setRing(circle, percent) {
  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${circumference - (percent / 100) * circumference}`;
}

function renderLineChart(data) {
  const line = document.getElementById("monthlyLine");
  const area = document.getElementById("monthlyArea");
  if (!line || !area) return;

  const width = 600;
  const height = 200;
  const pad = 18;
  const step = (width - pad * 2) / (Math.max(data.length, 2) - 1);

  const points = data.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - (value / 100) * (height - pad * 2);
    return { x, y };
  });

  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const areaPath = `M${pad},${height - pad} ${points.map((point) => `L${point.x},${point.y}`).join(" ")} L${pad + step * (data.length - 1)},${height - pad} Z`;

  line.setAttribute("d", linePath);
  area.setAttribute("d", areaPath);

  const length = line.getTotalLength();
  line.style.strokeDasharray = `${length}`;
  line.style.strokeDashoffset = `${length}`;

  requestAnimationFrame(() => {
    line.classList.add("draw");
    area.classList.add("draw");
  });

  const avg = Math.round(data.reduce((sum, value) => sum + value, 0) / (data.length || 1));
  const avgEl = document.getElementById("monthlyAvg");
  if (avgEl) avgEl.textContent = `${avg}%`;
}

function renderHeatmap(history) {
  const container = document.getElementById("heatmap");
  if (!container) return;
  container.innerHTML = "";

  const keys = Object.keys(history).sort();
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = formatDateKey(d);
    const logs = history[key];
    const score = calculateScore(logs);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `heat-day level-${getLevel(score)}`;
    button.dataset.day = d.getDate();
    button.dataset.score = score;
    button.innerHTML = `<span>${d.getDate()}</span>`;
    container.appendChild(button);
  }
}

function getLevel(score) {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 55) return 3;
  if (score >= 40) return 2;
  return 1;
}

function updateOverviewStats(data) {
  const validData = data.filter(d => d > 0);

  const best = Math.max(...data, 0);
  const worst = Math.min(...data, 100);

  let currentStreak = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] > 0) currentStreak++;
    else break;
  }

  const missed = data.filter((score) => score === 0).length;

  const bestEl = document.getElementById("bestDay");
  const worstEl = document.getElementById("worstDay");
  const streakEl = document.getElementById("streakCount");
  const missedEl = document.getElementById("missedCount");

  if (bestEl) bestEl.textContent = `${best}%`;
  if (worstEl) worstEl.textContent = `${worst}%`;
  if (streakEl) streakEl.textContent = `${currentStreak} days`;
  if (missedEl) missedEl.textContent = `${missed} days`;
}

function renderCategoryDonut(history) {
  const donut = document.getElementById("categoryDonut");
  const legend = document.getElementById("categoryLegend");
  if (!donut || !legend) return;

  const categoryCounts = {};
  systems.forEach(s => categoryCounts[s.id] = 0);

  let totalLogs = 0;
  Object.values(history).forEach(dayLogs => {
    if (!dayLogs) return;
    systems.forEach(sys => {
      if (dayLogs[sys.id]?.done) {
        categoryCounts[sys.id]++;
        totalLogs++;
      }
    });
  });

  const colors = getDonutColors();
  const segments = systems.map((sys, index) => ({
    label: sys.label,
    value: totalLogs ? Math.round((categoryCounts[sys.id] / totalLogs) * 100) : 0,
    color: colors[index % colors.length]
  })).sort((a, b) => b.value - a.value);

  setDonut(donut, segments);
  legend.innerHTML = "";

  segments.forEach((segment) => {
    const entry = document.createElement("div");
    entry.className = "legend-item";
    entry.innerHTML = `<span class="legend-swatch" style="background:${segment.color}"></span>${segment.label}`;
    legend.appendChild(entry);
  });

  renderBreakdown(segments);
}

function updateAnalytics(monthlyScores) {
  const avg = Math.round(monthlyScores.reduce((sum, value) => sum + value, 0) / (monthlyScores.length || 1));

  const overallEl = document.getElementById("overallCompletion");
  if (overallEl) overallEl.textContent = `${avg}%`;

  const completionDonut = document.getElementById("completionDonut");
  if (completionDonut) {
    const colors = getDonutColors();
    setDonut(completionDonut, [
      { label: "Completed", value: avg, color: colors[1] || "#7a927c" },
      { label: "Incomplete", value: 100 - avg, color: colors[9] || "#b0847c" }
    ]);
  }
}

function renderBreakdown(segments) {
  const breakdown = document.getElementById("categoryBreakdown");
  if (!breakdown) return;

  breakdown.innerHTML = "";

  segments.forEach((segment) => {
    const item = document.createElement("div");
    item.className = "breakdown-item";
    item.innerHTML = `
      <div class="breakdown-label">
        <span>${segment.label}</span>
        <span>${segment.value}%</span>
      </div>
      <div class="breakdown-bar">
        <div class="breakdown-fill" style="width:${segment.value}%; background:${segment.color}"></div>
      </div>
    `;
    breakdown.appendChild(item);
  });
}

function setDonut(element, segments) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cumulative = 0;

  if (total === 0) {
    element.style.setProperty("--donut", `conic-gradient(var(--line) 0% 100%)`);
    return;
  }

  const stops = segments.map((segment) => {
    const start = (cumulative / total) * 100;
    cumulative += segment.value;
    const end = (cumulative / total) * 100;
    return `${segment.color} ${start}% ${end}%`;
  });
  element.style.setProperty("--donut", `conic-gradient(${stops.join(", ")})`);
}

function getDonutColors() {
  const styles = getComputedStyle(root);
  const colors = [];
  for (let i = 1; i <= 12; i += 1) {
    colors.push(styles.getPropertyValue(`--donut-${i}`).trim());
  }
  return colors.filter(Boolean);
}

function setInsight(history) {
  const insightEl = document.getElementById("insightText");
  if (!insightEl) return;

  const idx = Math.floor(Math.random() * insightMessages.length);
  insightEl.textContent = insightMessages[idx];
}

function revealCards() {
  const cards = Array.from(document.querySelectorAll("[data-animate]"));
  cards.forEach((card, index) => {
    setTimeout(() => card.classList.add("is-visible"), index * 120);
  });
}

function updateCountdown() {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  const nextYearDate = new Date(nextYear, 0, 1);
  const diff = nextYearDate - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  const daysEl = document.getElementById('daysRemaining');
  const nextYearEl = document.getElementById('nextYear');
  if (daysEl) daysEl.textContent = days;
  if (nextYearEl) nextYearEl.textContent = nextYear;
}
