let currentPage = "today";
let currentLanguage = localStorage.getItem("lang") || "ar";

const translations = {
    ar: {
        today: "اليوم",
        yesterday: "الأمس",
        tomorrow: "الغد",
        favorites: "⭐ المفضلة",
        settings: "⚙ الإعدادات",
        loading: "جاري جلب المباريات...",
        error: "حدث خطأ أثناء جلب البيانات",
        finished: "انتهت",
        live: "مباشر",
        notStarted: "لم تبدأ",
        postponed: "تأجلت",
        searchTeams: "ابحث عن فريق (3 أحرف على الأقل)...",
        myTeams: "فرقي المفضلة",
        noTeams: "لم تضف أي فريق بعد. ابحث وأضف فرقك المفضلة.",
        add: "أضف",
        remove: "إزالة",
        searchResults: "نتائج البحث",
        noResults: "لا توجد نتائج",
        todayMatchesForFavorites: "مباريات فرقي اليوم",
        noFavoriteMatchesToday: "لا توجد مباريات اليوم لفرقك المفضلة",
        addTeamsToSeeMatches: "أضف فرقاً للمفضلة لعرض مبارياتها اليوم"
    },
    en: {
        today: "Today",
        yesterday: "Yesterday",
        tomorrow: "Tomorrow",
        favorites: "⭐ Favorites",
        settings: "⚙ Settings",
        loading: "Loading matches...",
        error: "Error loading data",
        finished: "Finished",
        live: "Live",
        notStarted: "Not Started",
        postponed: "Postponed",
        searchTeams: "Search for a team (min 3 characters)...",
        myTeams: "My favorite teams",
        noTeams: "You haven't added any team yet. Search and add your favorites.",
        add: "Add",
        remove: "Remove",
        searchResults: "Search results",
        noResults: "No results",
        todayMatchesForFavorites: "Today's matches for my teams",
        noFavoriteMatchesToday: "No matches today for your favorite teams",
        addTeamsToSeeMatches: "Add teams to favorites to see their matches today"
    }
};

const FAVORITE_TEAMS_KEY = "matchlogic_favorite_teams";

function getFavoriteTeams() {
    try {
        const raw = localStorage.getItem(FAVORITE_TEAMS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveFavoriteTeams(teams) {
    localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(teams));
    syncPushSubscription();
}

function urlBase64ToUint8Array(base64) {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

async function registerPushAndSyncFavorites() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const res = await fetch("/api/push/vapid-public");
        const { publicKey } = await res.json();
        if (!publicKey) return;
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        const favoriteTeamIds = getFavoriteTeams().map((t) => t.id);
        await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subscription: sub.toJSON(),
                favoriteTeamIds
            })
        });
    } catch (_) {}
}

async function syncPushSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub || Notification.permission !== "granted") return;
        const favoriteTeamIds = getFavoriteTeams().map((t) => t.id);
        await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subscription: sub.toJSON(),
                favoriteTeamIds
            })
        });
    } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
    setActiveTab("today");
    changePage("today");
    registerPushAndSyncFavorites();
});

function setActiveTab(page) {
    document.querySelectorAll(".tabs button").forEach(btn => {
        btn.classList.remove("active");
    });

    const tab = document.getElementById(page + "Tab");
    if (tab) tab.classList.add("active");
}

function getDate(type) {
    const d = new Date();
    if (type === "yesterday") d.setDate(d.getDate() - 1);
    if (type === "tomorrow") d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
}

function isMatchDateInPast(match) {
    const dateStr = match.fixture?.date;
    if (!dateStr) return false;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(0, 0, 0, 0);
    const matchD = new Date(dateStr);
    const matchDayStart = new Date(matchD.getFullYear(), matchD.getMonth(), matchD.getDate());
    matchDayStart.setHours(0, 0, 0, 0);
    return matchDayStart.getTime() < todayStart.getTime();
}

function formatMatchTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const locale = currentLanguage === "ar" ? "ar-EG" : "en-GB";
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
}

const FINISHED_OR_POSTPONED_CODES = ["FT", "AET", "PEN", "PST"];
function isFinishedOrPostponed(statusShort) {
    return statusShort && FINISHED_OR_POSTPONED_CODES.includes(statusShort);
}

async function changePage(page) {
    currentPage = page;
    setActiveTab(page);

    const container = document.getElementById("matchesContainer");

    if (page === "today" || page === "yesterday" || page === "tomorrow") {
        await loadMatches(page);
    }

    else if (page === "favorites") {
        renderFavoritesPage(container);
    }

    else if (page === "settings") {
        container.innerHTML = `
            <div class="center-page">
                <h2>${translations[currentLanguage].settings}</h2>
                <button onclick="changeLanguage('ar')">العربية</button>
                <button onclick="changeLanguage('en')">English</button>
            </div>
        `;
    }
}

async function loadMatches(type) {
    const container = document.getElementById("matchesContainer");
    container.innerHTML = `<p class="loading">${translations[currentLanguage].loading}</p>`;

    try {
        const res = await fetch(`/api/matches?date=${getDate(type)}`);
        if (!res.ok) throw new Error("Server error");

        const data = await res.json();
        displayMatches(data.response, type);

    } catch (err) {
        container.innerHTML = `<p class="error">${translations[currentLanguage].error}</p>`;
    }
}

function displayMatches(matches, pageType) {
    displayMatchesInContainer(matches, document.getElementById("matchesContainer"), pageType);
}

function displayMatchesInContainer(matches, container, pageType) {
    if (!container) return;
    container.innerHTML = "";
    pageType = pageType || "today";

    let list = matches || [];
    if (pageType === "yesterday") {
        list = list.filter((m) => isFinishedOrPostponed(m.fixture?.status?.short));
    }
    if (!list.length) {
        container.innerHTML = "<p class='error'>لا توجد مباريات</p>";
        return;
    }

    list.forEach((match) => {
        const card = document.createElement("div");
        card.className = "match-card";
        const statusShort = match.fixture?.status?.short;
        const dateInPast = isMatchDateInPast(match);

        let scoreHtml, statusText, statusClass;

        if (pageType === "yesterday") {
            scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
            statusText = statusShort === "PST" ? translations[currentLanguage].postponed : translations[currentLanguage].finished;
            statusClass = "status status-finished";
        } else if (pageType === "tomorrow") {
            scoreHtml = formatMatchTime(match.fixture?.date) || "—";
            statusText = statusShort === "PST" ? translations[currentLanguage].postponed : translations[currentLanguage].notStarted;
            statusClass = "status status-finished";
        } else {
            scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
            if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN" || dateInPast) {
                statusText = translations[currentLanguage].finished;
                statusClass = "status status-finished";
            } else if (statusShort === "PST") {
                statusText = translations[currentLanguage].postponed;
                statusClass = "status status-finished";
            } else if (statusShort === "NS") {
                statusText = translations[currentLanguage].notStarted;
                statusClass = "status status-finished";
            } else {
                statusText = translations[currentLanguage].live;
                statusClass = "status";
            }
        }

        card.innerHTML = `
            <div class="match-row">
                <div class="team">
                    <img src="${match.teams.home.logo}" alt="" />
                    <span>${match.teams.home.name}</span>
                </div>
                <div class="score">
                    ${scoreHtml}
                    <div class="${statusClass}">${statusText}</div>
                </div>
                <div class="team">
                    <img src="${match.teams.away.logo}" alt="" />
                    <span>${match.teams.away.name}</span>
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            window.location.href = `match.html?id=${match.fixture.id}`;
        });
        container.appendChild(card);
    });
}

function changeLanguage(lang) {
    localStorage.setItem("lang", lang);
    location.reload();
}

// ——— المفضلة: بحث + حفظ في localStorage ———
let searchDebounceTimer = null;
let lastTeamSearchResults = [];

function renderFavoritesPage(container) {
    const favorites = getFavoriteTeams();
    container.innerHTML = `
        <div class="favorites-page">
            <section class="favorites-today-section">
                <h3>${translations[currentLanguage].todayMatchesForFavorites}</h3>
                <div id="favoritesTodayMatches" class="matches favorites-today-matches"></div>
            </section>
            <div class="favorites-header">
                <h2>${translations[currentLanguage].myTeams}</h2>
                <input type="text" id="teamSearchInput" class="search-input" placeholder="${translations[currentLanguage].searchTeams}" autocomplete="off" />
            </div>
            <div id="searchResults" class="search-results"></div>
            <div class="favorite-teams-list">
                ${favorites.length === 0
                    ? `<p class="favorites-empty">${translations[currentLanguage].noTeams}</p>`
                    : favorites.map(t => `
                        <div class="favorite-team-item" data-id="${t.id}">
                            <img src="${t.logo}" alt="" />
                            <span>${t.name}</span>
                            <button type="button" class="btn-remove" onclick="removeFromFavorites(${t.id})" aria-label="${translations[currentLanguage].remove}">${translations[currentLanguage].remove}</button>
                        </div>
                    `).join("")
                }
            </div>
        </div>
    `;
    const input = document.getElementById("teamSearchInput");
    if (input) {
        input.oninput = () => {
            clearTimeout(searchDebounceTimer);
            const q = input.value.trim();
            const resultsEl = document.getElementById("searchResults");
            if (q.length < 3) {
                resultsEl.innerHTML = "";
                lastTeamSearchResults = [];
                return;
            }
            searchDebounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`);
                    const data = await res.json();
                    const rawTeams = data.response || [];
                    lastTeamSearchResults = rawTeams.map(team => ({
                        id: team.team?.id ?? team.id,
                        name: team.team?.name ?? team.name ?? "",
                        logo: team.team?.logo ?? team.logo ?? ""
                    }));
                    const favIds = getFavoriteTeams().map(t => t.id);
                    resultsEl.innerHTML = lastTeamSearchResults.length === 0
                        ? `<p class="search-no-results">${translations[currentLanguage].noResults}</p>`
                        : lastTeamSearchResults.map(team => {
                            const already = favIds.includes(team.id);
                            return `
                                <div class="team-result">
                                    <img src="${team.logo}" alt="" />
                                    <span>${team.name}</span>
                                    ${already ? `<span class="already-added">✓</span>` : `<button type="button" class="btn-add" onclick="addToFavoritesById(${team.id})">${translations[currentLanguage].add}</button>`}
                                </div>
                            `;
                        }).join("");
                } catch (err) {
                    resultsEl.innerHTML = `<p class="error">${translations[currentLanguage].error}</p>`;
                }
            }, 300);
        };
    }
    loadFavoritesTodayMatches();
}

async function loadFavoritesTodayMatches() {
    const container = document.getElementById("favoritesTodayMatches");
    if (!container) return;
    const favIds = getFavoriteTeams().map(t => t.id);
    if (favIds.length === 0) {
        container.innerHTML = `<p class="favorites-empty">${translations[currentLanguage].addTeamsToSeeMatches}</p>`;
        return;
    }
    container.innerHTML = `<p class="loading">${translations[currentLanguage].loading}</p>`;
    try {
        const res = await fetch(`/api/matches?date=${getDate("today")}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        const allMatches = data.response || [];
        const filtered = allMatches.filter(m => {
            const homeId = m.teams?.home?.id;
            const awayId = m.teams?.away?.id;
            return (homeId && favIds.includes(homeId)) || (awayId && favIds.includes(awayId));
        });
        if (filtered.length === 0) {
            container.innerHTML = `<p class="favorites-empty">${translations[currentLanguage].noFavoriteMatchesToday}</p>`;
        } else {
            displayMatchesInContainer(filtered, container, "today");
        }
    } catch (err) {
        container.innerHTML = `<p class="error">${translations[currentLanguage].error}</p>`;
    }
}

function addToFavoritesById(teamId) {
    const team = lastTeamSearchResults.find(t => t.id === teamId);
    if (!team) return;
    const list = getFavoriteTeams();
    if (list.some(t => t.id === team.id)) return;
    list.push({ id: team.id, name: team.name, logo: team.logo || "" });
    saveFavoriteTeams(list);
    renderFavoritesPage(document.getElementById("matchesContainer"));
}

function removeFromFavorites(teamId) {
    const list = getFavoriteTeams().filter(t => t.id !== teamId);
    saveFavoriteTeams(list);
    renderFavoritesPage(document.getElementById("matchesContainer"));
}
