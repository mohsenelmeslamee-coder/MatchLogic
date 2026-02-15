const params = new URLSearchParams(window.location.search);
const matchId = params.get("id");

const TAB_EMPTY = {
  events: "لم تبدأ المباراة بعد",
  lineups: "التشكيلة لم تعلن بعد",
  statistics: "لا توجد إحصائيات متاحة"
};

function goBack() {
  window.history.back();
}

function setActiveTab(tabName) {
  document.querySelectorAll(".match-detail-tab").forEach(t => {
    t.classList.remove("active");
    t.setAttribute("aria-selected", "false");
  });
  document.querySelectorAll(".match-detail-panel").forEach(p => {
    p.classList.remove("active");
    p.hidden = true;
  });
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = document.getElementById(`panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (tab) {
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
  }
  if (panel) {
    panel.classList.add("active");
    panel.hidden = false;
  }
}

async function loadEvents() {
  const panel = document.getElementById("panelEvents");
  if (!panel || !matchId) return;
  try {
    const res = await fetch(`/api/match/events/${matchId}`);
    const data = await res.json();
    const events = data.response || [];
    if (events.length === 0) {
      panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.events}</p>`;
      return;
    }
    panel.innerHTML = `
      <h3 class="panel-title">الأحداث</h3>
      <ul class="events-list">
        ${events.map(e => `
          <li class="event-item event-${(e.type || "").toLowerCase()}">
            <span class="event-time">${e.time?.elapsed ?? ""}'</span>
            <span class="event-detail">${e.detail || e.type || ""} — ${e.player?.name || "—"}</span>
          </li>
        `).join("")}
      </ul>
    `;
  } catch (err) {
    panel.innerHTML = `<p class="error">خطأ في جلب الأحداث</p>`;
  }
}

async function loadLineups() {
  const panel = document.getElementById("panelLineups");
  if (!panel || !matchId) return;
  try {
    const res = await fetch(`/api/match/lineups/${matchId}`);
    const data = await res.json();
    const lineups = data.response || [];
    if (!lineups.length) {
      panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.lineups}</p>`;
      return;
    }
    panel.innerHTML = lineups.map(teamLineup => {
      const team = teamLineup.team || {};
      const startXI = teamLineup.startXI || [];
      const substitutes = teamLineup.substitutes || [];
      return `
        <div class="lineup-team">
          <h4 class="lineup-team-name"><img src="${team.logo || ""}" alt="" class="lineup-team-logo" /> ${team.name || ""}</h4>
          <div class="lineup-section">
            <strong>الأساسيون</strong>
            <ul class="lineup-list">
              ${startXI.map(p => `<li>${p.player?.number ?? ""} - ${p.player?.name ?? ""}</li>`).join("")}
            </ul>
          </div>
          ${substitutes.length ? `
          <div class="lineup-section">
            <strong>البدلاء</strong>
            <ul class="lineup-list">
              ${substitutes.map(p => `<li>${p.player?.number ?? ""} - ${p.player?.name ?? ""}</li>`).join("")}
            </ul>
          </div>
          ` : ""}
        </div>
      `;
    }).join("");
  } catch (err) {
    panel.innerHTML = `<p class="error">خطأ في جلب التشكيلة</p>`;
  }
}

async function loadStatistics() {
  const panel = document.getElementById("panelStatistics");
  if (!panel || !matchId) return;
  try {
    const res = await fetch(`/api/match/statistics/${matchId}`);
    const data = await res.json();
    const stats = data.response || [];
    if (!stats.length) {
      panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.statistics}</p>`;
      return;
    }
    panel.innerHTML = stats.map(teamStat => {
      const team = teamStat.team || {};
      const items = teamStat.statistics || [];
      return `
        <div class="stats-team">
          <h4 class="stats-team-name"><img src="${team.logo || ""}" alt="" class="stats-team-logo" /> ${team.name || ""}</h4>
          <ul class="stats-list">
            ${items.map(s => `<li><span class="stats-type">${s.type || ""}</span><span class="stats-value">${s.value ?? ""}</span></li>`).join("")}
          </ul>
        </div>
      `;
    }).join("");
  } catch (err) {
    panel.innerHTML = `<p class="error">خطأ في جلب الإحصائيات</p>`;
  }
}

function initTabs() {
  document.querySelectorAll(".match-detail-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      setActiveTab(tabName);
      if (tabName === "events") loadEvents();
      else if (tabName === "lineups") loadLineups();
      else if (tabName === "statistics") loadStatistics();
    });
  });
}

if (!matchId) {
  const wrap = document.getElementById("matchDetails");
  if (wrap) {
    wrap.innerHTML = "<p class='match-detail-empty'>معرف المباراة غير موجود. <a href='/'>العودة للرئيسية</a></p>";
  }
} else {
  initTabs();
  loadEvents();
}
