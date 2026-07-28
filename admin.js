const ConfigService = (() => {
  let store = {
    aiTone: "warm-confident",
    safety: "Respectful, consent-first, supportive",
    premiumEnabled: true,
    maintenanceMode: false,
    cloudEndpoint: "local-first",
    pushTopic: "daily-coaching"
  };
  return {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
    },
    set(key, value) {
      store = { ...store, [key]: value };
      return store[key];
    },
    getAll() {
      return { ...store };
    }
  };
})();

const keys = {
  admin: "charmcraft.admin",
  appUser: "charmcraft.user",
  missions: "charmcraft.missions",
  backup: "charmcraft.backup"
};

let state = {
  users: [],
  achievements: ["First Spark", "Confident Reply", "Signal Reader"],
  missions: [],
  notifications: [],
  reports: [],
  logs: [],
  prompt: "Coach Victor should be warm, direct, respectful, practical, and confidence-building.",
  content: "CharmCraft content library: replies, status, insights, starters, and coaching scripts.",
  insights: "Lead with curiosity.\nConfidence sounds calm.\nGreat flirting is respectful and specific.",
  practice: "Beginner greeting practice\nFlirting mode playful banter\nProfessional small talk"
};

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value) || fallback;
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  window.setTimeout(() => {
    toast.textContent = "Admin ready";
  }, 2300);
}

function log(message) {
  state.logs.unshift({ message, time: new Date().toLocaleString() });
  state.logs = state.logs.slice(0, 30);
  saveState();
  renderLogs();
}

function saveState() {
  saveJson(keys.admin, state);
}

function loadState() {
  try {
    state = safeParse(localStorage.getItem(keys.admin), state);
    const appUser = safeParse(localStorage.getItem(keys.appUser), null);
    const appMissions = safeParse(localStorage.getItem(keys.missions), []);
    if (appUser && !state.users.some((user) => user.email === appUser.email)) {
      state.users.push({ name: appUser.name, email: appUser.email, premium: Boolean(appUser.premium), xp: appUser.xp || 0 });
    }
    if (Array.isArray(appMissions) && appMissions.length) state.missions = appMissions;
  } catch (error) {
    console.error(error);
  }
}

function navigateTo(panelId) {
  try {
    document.querySelectorAll(".admin-panel").forEach((panel) => panel.classList.toggle("active", panel.id === panelId));
    document.querySelectorAll("#adminNav button").forEach((button) => button.classList.toggle("active", button.dataset.panel === panelId));
    const title = document.getElementById("panelTitle");
    const activeButton = document.querySelector(`#adminNav button[data-panel="${panelId}"]`);
    if (title && activeButton) title.textContent = activeButton.textContent || "Dashboard";
    drawAnalytics();
  } catch (error) {
    console.error(error);
  }
}

function bindEvents() {
  try {
    document.getElementById("adminNav")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-panel]");
      if (button) navigateTo(button.dataset.panel);
    });
    document.getElementById("saveAll")?.addEventListener("click", () => {
      readEditors();
      saveState();
      log("All admin changes saved");
      showToast("Changes saved");
    });
    document.getElementById("addUser")?.addEventListener("click", () => {
      state.users.push({ name: `User ${state.users.length + 1}`, email: `user${state.users.length + 1}@charmcraft.app`, premium: state.users.length % 2 === 0, xp: 80 + state.users.length * 35 });
      renderAll();
      log("Test user added");
      showToast("User added");
    });
    document.body.addEventListener("click", handleActions);
  } catch (error) {
    console.error(error);
  }
}

function handleActions(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  try {
    const action = button.dataset.action;
    if (action === "savePrompt") state.prompt = document.getElementById("coachPrompt").value;
    if (action === "saveContent") state.content = document.getElementById("contentEditor").value;
    if (action === "achievement") createAchievement();
    if (action === "mission") createMission();
    if (action === "practice") state.practice = document.getElementById("practiceScenarios").value;
    if (action === "insights") state.insights = document.getElementById("insightEditor").value;
    if (action === "notify") queueNotification();
    if (action === "report") createReport();
    if (action === "ai") saveAiConfig();
    if (action === "backup") createBackup();
    if (action === "restore") restoreBackup();
    if (action === "settings") saveSettings();
    if (action === "cloud") ConfigService.set("cloudEndpoint", document.getElementById("cloudEndpoint").value);
    if (action === "push") ConfigService.set("pushTopic", document.getElementById("pushTopic").value);
    saveState();
    renderAll();
    showToast(`${button.textContent} complete`);
  } catch (error) {
    console.error(error);
  }
}

function readEditors() {
  const coach = document.getElementById("coachPrompt");
  const content = document.getElementById("contentEditor");
  const practice = document.getElementById("practiceScenarios");
  const insights = document.getElementById("insightEditor");
  if (coach) state.prompt = coach.value;
  if (content) state.content = content.value;
  if (practice) state.practice = practice.value;
  if (insights) state.insights = insights.value;
}

function createAchievement() {
  const input = document.getElementById("achievementName");
  const value = input.value.trim();
  if (!value) return;
  state.achievements.push(value);
  input.value = "";
  log(`Achievement created: ${value}`);
}

function createMission() {
  const name = document.getElementById("missionName");
  const xp = document.getElementById("missionXp");
  const label = name.value.trim();
  if (!label) return;
  state.missions.push({ id: `admin-${Date.now()}`, label, xp: Number(xp.value || 25), done: false });
  saveJson(keys.missions, state.missions);
  name.value = "";
  log(`Mission created: ${label}`);
}

function queueNotification() {
  const title = document.getElementById("notificationTitle").value.trim() || "CharmCraft";
  const body = document.getElementById("notificationBody").value.trim() || "Your daily coaching reminder is ready.";
  state.notifications.unshift({ title, body, time: new Date().toLocaleString() });
  log(`Notification queued: ${title}`);
}

function createReport() {
  state.reports.unshift({ title: "Weekly growth report", time: new Date().toLocaleString(), body: `${state.users.length} users, ${state.missions.length} missions, ${state.notifications.length} notifications.` });
  log("Report generated");
}

function saveAiConfig() {
  ConfigService.set("aiTone", document.getElementById("aiTone").value);
  ConfigService.set("safety", document.getElementById("aiSafety").value);
  log("AI config updated");
}

function saveSettings() {
  ConfigService.set("premiumEnabled", document.getElementById("premiumEnabled").checked);
  ConfigService.set("maintenanceMode", document.getElementById("maintenanceMode").checked);
  log("Settings updated");
}

function createBackup() {
  readEditors();
  const backup = { createdAt: new Date().toISOString(), state, config: ConfigService.getAll() };
  saveJson(keys.backup, backup);
  document.getElementById("backupOutput").value = JSON.stringify(backup, null, 2);
  log("Backup created");
}

function restoreBackup() {
  const backup = safeParse(localStorage.getItem(keys.backup), null);
  if (!backup || !backup.state) {
    showToast("No backup found");
    return;
  }
  state = backup.state;
  log("Backup restored");
}

function renderAll() {
  renderStats();
  renderEditors();
  renderUsers();
  renderAchievements();
  renderMissions();
  renderNotifications();
  renderReports();
  renderLogs();
  drawAnalytics();
}

function renderStats() {
  const premium = state.users.filter((user) => user.premium).length;
  setText("statUsers", state.users.length);
  setText("statPremium", premium);
  setText("statRevenue", `$${premium * 49}`);
  setText("statAi", state.users.reduce((sum, user) => sum + Math.max(10, Math.round((user.xp || 0) / 4)), 0));
  const health = ["Repository", "Auth", "Sync", "Notifications", "Remote Config", "Performance", "Analytics", "Settings", "Premium", "AI", "Practice", "Storage"];
  document.getElementById("healthList").innerHTML = health.map((item) => `<span>✅ ${item}</span>`).join("");
}

function renderEditors() {
  setValue("coachPrompt", state.prompt);
  setValue("contentEditor", state.content);
  setValue("practiceScenarios", state.practice);
  setValue("insightEditor", state.insights);
  setValue("aiTone", ConfigService.get("aiTone", "warm-confident"));
  setValue("aiSafety", ConfigService.get("safety", "Respectful, consent-first, supportive"));
  setValue("cloudEndpoint", ConfigService.get("cloudEndpoint", "local-first"));
  setValue("pushTopic", ConfigService.get("pushTopic", "daily-coaching"));
  const premium = document.getElementById("premiumEnabled");
  const maintenance = document.getElementById("maintenanceMode");
  if (premium) premium.checked = Boolean(ConfigService.get("premiumEnabled", true));
  if (maintenance) maintenance.checked = Boolean(ConfigService.get("maintenanceMode", false));
}

function renderUsers() {
  const list = document.getElementById("userList");
  list.innerHTML = state.users.map((user, index) => `<div class="data-row"><div><strong>${escapeHtml(user.name)}</strong><br><small>${escapeHtml(user.email)} • ${user.xp || 0} XP • ${user.premium ? "Premium" : "Free"}</small></div><button type="button" data-delete-user="${index}">Remove</button></div>`).join("") || "<small>No users yet. Add one or open the app.</small>";
  list.querySelectorAll("button[data-delete-user]").forEach((button) => button.addEventListener("click", () => {
    state.users.splice(Number(button.dataset.deleteUser), 1);
    renderAll();
    saveState();
    log("User removed");
  }));
}

function renderAchievements() {
  document.getElementById("achievementList").innerHTML = state.achievements.map((item) => `<span>🏅 ${escapeHtml(item)}</span>`).join("");
}

function renderMissions() {
  document.getElementById("missionList").innerHTML = state.missions.map((mission) => `<div class="data-row"><span>${escapeHtml(mission.label)}</span><strong>+${mission.xp} XP</strong></div>`).join("") || "<small>No missions created.</small>";
}

function renderNotifications() {
  document.getElementById("notificationList").innerHTML = state.notifications.map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.body)} • ${item.time}</small></div></div>`).join("") || "<small>No notifications queued.</small>";
}

function renderReports() {
  document.getElementById("reportList").innerHTML = state.reports.map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.body)} • ${item.time}</small></div></div>`).join("") || "<small>No reports generated.</small>";
}

function renderLogs() {
  const list = document.getElementById("logList");
  if (!list) return;
  list.innerHTML = state.logs.map((item) => `<div class="data-row"><span>${escapeHtml(item.message)}</span><small>${item.time}</small></div>`).join("") || "<small>No logs yet.</small>";
}

function drawAnalytics() {
  const canvas = document.getElementById("analyticsCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(157,92,255,.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const values = [state.users.length + 2, state.missions.length + 3, state.notifications.length + 1, state.achievements.length + 2, state.reports.length + 1];
  const max = Math.max(...values, 8);
  values.forEach((value, index) => {
    const height = (value / max) * 190;
    const x = 70 + index * 130;
    const y = 225 - height;
    const gradient = ctx.createLinearGradient(0, y, 0, 225);
    gradient.addColorStop(0, "#5cffbd");
    gradient.addColorStop(1, "#9d5cff");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, 58, height);
  });
  ctx.fillStyle = "#f7f2ff";
  ctx.font = "16px system-ui";
  ctx.fillText("Users   Missions   Push   Badges   Reports", 60, 248);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function init() {
  try {
    loadState();
    bindEvents();
    if (!state.users.length) {
      state.users = [
        { name: "Maya Stone", email: "maya@charmcraft.app", premium: true, xp: 420 },
        { name: "Leo Hart", email: "leo@charmcraft.app", premium: false, xp: 185 }
      ];
    }
    if (!state.missions.length) {
      state.missions = [
        { id: "m1", label: "Send one warm opener", xp: 20, done: false },
        { id: "m2", label: "Practice confident texting", xp: 30, done: false }
      ];
    }
    renderAll();
    navigateTo("dashboard");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.error(error));
    }
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", init, { once: true });
