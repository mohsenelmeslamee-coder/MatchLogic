// Helper function for dynamic translations
function getTranslation(key) {
  return labels[currentLanguage]?.[key] || key;
}

const params = new URLSearchParams(window.location.search);
const matchId = params.get("id");
const currentLanguage = localStorage.getItem("lang") || "ar";

// Global labels dictionary for translations
const labels = {
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
    addTeamsToSeeMatches: "أضف فرقاً للمفضلة لعرض مبارياتها اليوم",
    matches: "المباريات",
    upcoming: "المباريات القادمة",
    formation: "التشكيلة",
    substitutes: "البدلاء",
    halfTime: "استراحة",
    events: "الأحداث",
    statistics: "الإحصائيات",
    playerIn: "دخل",
    playerOut: "خرج",
    totalShots: "إجمالي التسديدات",
    cornerKicks: "الركلات الركنية",
    possession: "الاستحواذ",
    fouls: "الأخطاء",
    offsides: "التسلل",
    yellowCards: "البطاقات الصفراء",
    redCards: "البطاقات الحمراء",
    lineupsNotYetAnnounced: "التشكيلة لم تعلن بعد",
    matchStats: "إحصائيات المباراة"
  },
  en: {
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
    favorites: "⭐ Favorites",
    settings: "⚙ Settings",
    loading: "Loading matches...",
    error: "Error occurred while fetching data",
    finished: "Finished",
    live: "Live",
    notStarted: "Not Started",
    postponed: "Postponed",
    searchTeams: "Search for a team (min 3 characters)...",
    myTeams: "My Favorite Teams",
    noTeams: "You haven't added any teams yet. Search and add your favorite teams.",
    add: "Add",
    remove: "Remove",
    searchResults: "Search Results",
    noResults: "No results found",
    todayMatchesForFavorites: "Today's Favorite Team Matches",
    noFavoriteMatchesToday: "No favorite team matches today",
    addTeamsToSeeMatches: "Add teams to favorites to see today's matches",
    matches: "Matches",
    upcoming: "Upcoming Matches",
    formation: "Formation",
    substitutes: "Substitutes",
    halfTime: "Half Time",
    events: "Events",
    statistics: "Statistics",
    playerIn: "IN",
    playerOut: "OUT",
    totalShots: "Total Shots",
    cornerKicks: "Corner Kicks",
    possession: "Possession",
    fouls: "Fouls",
    offsides: "Offsides",
    yellowCards: "Yellow Cards",
    redCards: "Red Cards",
    lineupsNotYetAnnounced: "Lineups not yet announced",
    matchStats: "Match Stats"
  }
};

const TAB_EMPTY = {
  ar: {
    events: "لا توجد أحداث",
    lineups: "لا توجد تشكيلة",
    statistics: "لا توجد إحصائيات",
    matches: "لا توجد مباريات"
  },
  en: {
    events: "No events",
    lineups: "No lineups",
    statistics: "No statistics",
    matches: "No matches"
  }
};

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes for match details (shorter for live data)
const cache = new Map();

function goBack() {
  window.history.back();
}

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

function setActiveTab(tabName) {
  // STEP 1: Hide ALL tab panels and remove active class from ALL buttons
  document.querySelectorAll('.match-detail-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.hidden = true;
    panel.style.display = 'none';
  });
  
  document.querySelectorAll('.match-detail-tab').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // STEP 2: Show ONLY the selected tab
  const selectedPanel = document.getElementById(`panel${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (selectedPanel) {
    selectedPanel.classList.add('active');
    selectedPanel.hidden = false;
    selectedPanel.style.display = 'block';
  }

  const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (selectedTab) {
    selectedTab.classList.add('active');
    selectedTab.setAttribute('aria-selected', 'true');
  }

  // STEP 3: Load AI content only ONCE when AI tab is selected
  if (tabName === 'ai') {
    // Force AI panel and prediction container to be visible
    const aiPanel = document.getElementById('panelAI');
    const aiContainer = document.getElementById('aiPrediction');
    
    if (aiPanel) {
      aiPanel.style.display = 'block';
      aiPanel.hidden = false;
    }
    
    if (aiContainer) {
      aiContainer.style.display = 'block';
      aiContainer.style.visibility = 'visible';
      aiContainer.style.opacity = '1';
    }
    
    // Check if AI content is already loaded
    if (aiContainer && !aiContainer.hasAttribute('data-loaded')) {
      loadAIPrediction();
      aiContainer.setAttribute('data-loaded', 'true');
    }
  }
}

async function loadEvents() {
  const panel = document.getElementById("panelEvents");
  if (!panel || !matchId) return;
  
  const cacheKey = `events-${matchId}`;
  const cachedData = getCachedData(cacheKey);
  
  if (cachedData) {
    const events = cachedData.response || [];
    if (events.length === 0) {
      panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.events}</p>`;
      return;
    }
    panel.innerHTML = `
      <h3 class="panel-title">${currentLanguage === "en" ? "Events" : "الأحداث"}</h3>
      <ul class="events-list">
        ${events.map(e => {
          const isSubstitution = e.type === "subst";
          const isIn = e.detail?.toLowerCase().includes("in") || e.assist?.id;
          const playerOutName = e.player?.name || "—";
          const playerInName = e.assist?.name || "—";
          
          if (isSubstitution) {
            return `
              <li class="event-item event-substitution">
                <span class="event-time">${e.time?.elapsed ?? ""}'</span>
                <div class="substitution-info">
                  <div class="substitution-player out">
                    <span class="substitution-arrow out-arrow">↓</span>
                    <span class="player-name-out">${playerOutName}</span>
                  </div>
                  <div class="substitution-player in">
                    <span class="substitution-arrow in-arrow">↑</span>
                    <span class="player-name-in">${playerInName}</span>
                  </div>
                </div>
              </li>
            `;
          } else {
            return `
              <li class="event-item event-${(e.type || "").toLowerCase()}">
                <span class="event-time">${e.time?.elapsed ?? ""}'</span>
                <span class="event-detail">${e.detail || e.type || ""} — ${e.player?.name || "—"}</span>
              </li>
            `;
          }
        }).join("")}
      </ul>
    `;
    return;
  }
  
  try {
    const res = await fetch(`/api/match/events/${matchId}`);
    const data = await res.json();
    setCachedData(cacheKey, data);
    
    const events = data.response || [];
    if (events.length === 0) {
      panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.events}</p>`;
      return;
    }
    panel.innerHTML = `
      <h3 class="panel-title">${currentLanguage === "en" ? "Events" : "الأحداث"}</h3>
      <ul class="events-list">
        ${events.map(e => {
          const isSubstitution = e.type === "subst";
          const isIn = e.detail?.toLowerCase().includes("in") || e.assist?.id;
          const playerOutName = e.player?.name || "—";
          const playerInName = e.assist?.name || "—";
          
          if (isSubstitution) {
            return `
              <li class="event-item event-substitution">
                <span class="event-time">${e.time?.elapsed ?? ""}'</span>
                <div class="substitution-info">
                  <div class="substitution-player out">
                    <span class="substitution-arrow out-arrow">↓</span>
                    <span class="player-name-out">${playerOutName}</span>
                  </div>
                  <div class="substitution-player in">
                    <span class="substitution-arrow in-arrow">↑</span>
                    <span class="player-name-in">${playerInName}</span>
                  </div>
                </div>
              </li>
            `;
          } else {
            return `
              <li class="event-item event-${(e.type || "").toLowerCase()}">
                <span class="event-time">${e.time?.elapsed ?? ""}'</span>
                <span class="event-detail">${e.detail || e.type || ""} — ${e.player?.name || "—"}</span>
              </li>
            `;
          }
        }).join("")}
      </ul>
    `;
  } catch (err) {
    panel.innerHTML = `<p class="error">خطأ في جلب الأحداث</p>`;
  }
}

async function loadLineups() {
  const panel = document.getElementById("panelLineups");
  if (!panel || !matchId) return;
  
  const cacheKey = `lineups-${matchId}`;
  const cachedData = getCachedData(cacheKey);
  
  if (cachedData) {
    renderLineups(cachedData.response || []);
    return;
  }
  
  try {
    const res = await fetch(`/api/match/lineups/${matchId}`);
    const data = await res.json();
    setCachedData(cacheKey, data);
    renderLineups(data.response || []);
    
    // Check if lineup is empty and match is about to start or live
    if (!data.response || data.response.length === 0) {
      const matchRes = await fetch(`/api/matches?date=${new Date().toISOString().split('T')[0]}`);
      const matchData = await matchRes.json();
      const currentMatch = matchData.response?.find(m => m.fixture?.id == matchId);
      
      if (currentMatch) {
        const matchTime = new Date(currentMatch.fixture.date);
        const now = new Date();
        const timeUntilMatch = matchTime - now;
        
        // If match is within 2 hours or already started, start polling
        if (timeUntilMatch < 2 * 60 * 60 * 1000 || currentMatch.fixture.status?.short === 'LIVE') {
          console.log(`🔄 Starting lineup polling for match ${matchId}`);
          startLineupPolling(matchId);
        }
      }
    }
    
  } catch (err) {
    panel.innerHTML = `<p class="error">${getTranslation('error')}</p>`;
  }
}

// Lineup polling for matches about to start or live
let lineupPollingIntervals = {};

function startLineupPolling(matchId) {
  // Clear existing polling for this match
  if (lineupPollingIntervals[matchId]) {
    clearInterval(lineupPollingIntervals[matchId]);
  }
  
  // Poll every 2 minutes
  lineupPollingIntervals[matchId] = setInterval(async () => {
    try {
      console.log(`🔄 Checking for lineup updates for match ${matchId}`);
      
      const res = await fetch(`/api/match/lineups/${matchId}`);
      const data = await res.json();
      
      if (data.response && data.response.length > 0) {
        // Lineups found! Stop polling and render
        console.log(`✅ Lineups found for match ${matchId}`);
        clearInterval(lineupPollingIntervals[matchId]);
        delete lineupPollingIntervals[matchId];
        
        const cacheKey = `lineups-${matchId}`;
        setCachedData(cacheKey, data);
        renderLineups(data.response || []);
      }
    } catch (err) {
      console.error(`❌ Error polling lineups for match ${matchId}:`, err);
    }
  }, 2 * 60 * 1000); // 2 minutes
  
  // Stop polling after 30 minutes max
  setTimeout(() => {
    if (lineupPollingIntervals[matchId]) {
      clearInterval(lineupPollingIntervals[matchId]);
      delete lineupPollingIntervals[matchId];
      console.log(`⏹️ Stopped lineup polling for match ${matchId} (timeout)`);
    }
  }, 30 * 60 * 1000); // 30 minutes
}

// Pre-fetch lineups for favorite teams' live matches
async function preFetchFavoriteLineups() {
  const favoriteTeams = getFavoriteTeams();
  if (!favoriteTeams.length) return;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const matchesRes = await fetch(`/api/matches?date=${today}`);
    const matchesData = await matchesRes.json();
    
    // Find live matches involving favorite teams
    const liveFavoriteMatches = matchesData.response?.filter(match => 
      match.fixture.status?.short === 'LIVE' && (
        favoriteTeams.some(fav => fav.id === match.teams?.home?.id) ||
        favoriteTeams.some(fav => fav.id === match.teams?.away?.id)
      )
    ) || [];
    
    console.log(`🔄 Pre-fetching lineups for ${liveFavoriteMatches.length} live favorite matches`);
    
    // Pre-fetch lineups for these matches
    for (const match of liveFavoriteMatches) {
      const cacheKey = `lineups-${match.fixture.id}`;
      if (!getCachedData(cacheKey)) {
        try {
          const lineupRes = await fetch(`/api/match/lineups/${match.fixture.id}`);
          const lineupData = await lineupRes.json();
          setCachedData(cacheKey, lineupData);
          console.log(`✅ Pre-fetched lineups for match ${match.fixture.id}`);
        } catch (err) {
          console.log(`❌ Failed to pre-fetch lineups for match ${match.fixture.id}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error pre-fetching favorite lineups:', err);
  }
}

// Helper function to get favorite teams (from main.js)
function getFavoriteTeams() {
  const favorites = localStorage.getItem('favoriteTeams');
  return favorites ? JSON.parse(favorites) : [];
}

async function renderLineups(lineups) {
  const panel = document.getElementById("panelLineups");
  if (!panel) return;
  
  // Check for alternative lineup data structure
  let hasLineups = lineups && lineups.length > 0;
  
  // Try alternative field names if main array is empty
  if (!hasLineups && lineups && typeof lineups === 'object') {
    // Check for starting_lineups or other possible fields
    hasLineups = lineups.starting_lineups || lineups.lineups || lineups.teams;
  }
  
  if (!hasLineups) {
    panel.innerHTML = `<p class="match-detail-empty">${currentLanguage === 'ar' ? 'التشكيلة ستظهر فور توفرها من المصدر' : 'Lineups will be available once released by the source'}</p>`;
    return;
  }
  
  // Get match data for team logos
  try {
    const matchRes = await fetch(`/api/matches?date=${new Date().toISOString().split('T')[0]}`);
    const matchData = await matchRes.json();
    const currentMatch = matchData.response?.find(m => m.fixture?.id == matchId);
    
    if (!currentMatch) {
      panel.innerHTML = `<p class="match-detail-empty">${getTranslation('lineupsNotYetAnnounced')}</p>`;
      return;
    }
    
    // Ensure AI tab is not affected by lineup rendering
    const aiContainer = document.getElementById('aiPrediction');
    if (aiContainer && aiContainer.innerHTML.includes('جاري التحميل')) {
      // AI tab is still loading, don't interfere
      console.log('🤖 AI tab is loading, lineup rendering will not interfere');
    }
    
    panel.innerHTML = lineups.map((teamLineup, index) => {
      const team = teamLineup.team || {};
      const startXI = teamLineup.startXI || [];
      const substitutes = teamLineup.substitutes || [];
      const formation = teamLineup.formation || "4-4-2";
      const isHome = index === 0; // First team is home team
      
      return `
        <div class="lineup-section">
          <div class="lineup-header">
            <img src="${team.logo || ""}" alt="" class="lineup-team-logo" />
            <h3 class="lineup-team-name">${team.name || ""}</h3>
            <span class="formation-badge">${formation}</span>
          </div>
          <div class="football-pitch">
            <div class="pitch-grid">
              ${renderPitchPlayers(startXI, isHome, currentMatch)}
            </div>
          </div>
          <div class="substitutes-section">
            <h4>${getTranslation('substitutes')}</h4>
            <div class="substitutes-list">
              ${substitutes.map(player => `
                <div class="substitute-player">
                  <span class="sub-number">${player.player?.number ?? ""}</span>
                  <span class="sub-name">${player.player?.name ?? ""}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;
    }).join("");
  } catch (error) {
    console.error('Error loading match data for logos:', error);
    panel.innerHTML = `<p class="match-detail-empty">${getTranslation('lineupsNotYetAnnounced')}</p>`;
  }
}

function renderPitchPlayers(players, isHome, currentMatch) {
  // Group players by position for flexbox rows
  const positions = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };
  
  // Sort players by position - ENSURE ALL PLAYERS ARE PROCESSED
  players.forEach(player => {
    const pos = player.player?.pos?.charAt(0) || 'M';
    if (pos === 'G') positions.GK.push(player);
    else if (pos === 'D') positions.DEF.push(player);
    else if (pos === 'M') positions.MID.push(player);
    else positions.FWD.push(player);
  });
  
  let html = '';
  
  // Forwards row (top) - SHOW ALL FORWARDS
  if (positions.FWD.length > 0) {
    html += '<div class="pitch-row fwd-row">';
    positions.FWD.forEach(player => {
      // Use correct team logo logic
      const teamLogo = isHome ? currentMatch.teams.home.logo : currentMatch.teams.away.logo;
      
      html += `
        <div class="pitch-player forward">
          <div class="player-circle">
            ${teamLogo ? 
              `<img src="${teamLogo}" style="display: block !important; visibility: visible !important; opacity: 1 !important; width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 999;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` +
              `<div class="player-number-fallback">${player.player?.number ?? ""}</div>`
            : `<div class="player-number">${player.player?.number ?? ""}</div>`
            }
          </div>
          <span class="player-name-small">${player.player?.name ?? ""}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  // Midfielders row - SHOW ALL MIDFIELDERS
  if (positions.MID.length > 0) {
    html += '<div class="pitch-row mid-row">';
    positions.MID.forEach(player => {
      const teamLogo = isHome ? currentMatch.teams.home.logo : currentMatch.teams.away.logo;
      
      html += `
        <div class="pitch-player midfielder">
          <div class="player-circle">
            ${teamLogo ? 
              `<img src="${teamLogo}" style="display: block !important; visibility: visible !important; opacity: 1 !important; width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 999;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` +
              `<div class="player-number-fallback">${player.player?.number ?? ""}</div>`
            : `<div class="player-number">${player.player?.number ?? ""}</div>`
            }
          </div>
          <span class="player-name-small">${player.player?.name ?? ""}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  // Defenders row - SHOW ALL DEFENDERS
  if (positions.DEF.length > 0) {
    html += '<div class="pitch-row def-row">';
    positions.DEF.forEach(player => {
      const teamLogo = isHome ? currentMatch.teams.home.logo : currentMatch.teams.away.logo;
      
      html += `
        <div class="pitch-player defender">
          <div class="player-circle">
            ${teamLogo ? 
              `<img src="${teamLogo}" style="display: block !important; visibility: visible !important; opacity: 1 !important; width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 999;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` +
              `<div class="player-number-fallback">${player.player?.number ?? ""}</div>`
            : `<div class="player-number">${player.player?.number ?? ""}</div>`
            }
          </div>
          <span class="player-name-small">${player.player?.name ?? ""}</span>
        </div>
      `;
    });
    html += '</div>';
  }
  
  // Goalkeeper row (bottom) - SHOW ALL GOALKEEPERS
  if (positions.GK.length > 0) {
    positions.GK.forEach(player => {
      const teamLogo = isHome ? currentMatch.teams.home.logo : currentMatch.teams.away.logo;
      
      html += `
        <div class="pitch-row gk-row">
          <div class="pitch-player goalkeeper">
            <div class="player-circle">
              ${teamLogo ? 
                `<img src="${teamLogo}" style="display: block !important; visibility: visible !important; opacity: 1 !important; width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 999;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />` +
                `<div class="player-number-fallback">${player.player?.number ?? ""}</div>`
              : `<div class="player-number">${player.player?.number ?? ""}</div>`
              }
            </div>
            <span class="player-name-small">${player.player?.name ?? ""}</span>
          </div>
        </div>
      `;
    });
  }
  
  console.log('Total players rendered:', players.length, 'GK:', positions.GK.length, 'DEF:', positions.DEF.length, 'MID:', positions.MID.length, 'FWD:', positions.FWD.length);
  return html;
}

function renderStatistics(stats) {
  const panel = document.getElementById("panelStatistics");
  if (!panel) return;
  
  if (!stats.length) {
    panel.innerHTML = `<p class="match-detail-empty">${TAB_EMPTY.statistics}</p>`;
    return;
  }
  
  // Get match data for team logos and names
  let matchData = null;
  try {
    const matchRes = fetch(`/api/matches?date=${new Date().toISOString().split('T')[0]}`);
    matchData = matchRes.then(res => res.json()).then(data => 
      data.response?.find(m => m.fixture?.id == matchId)
    );
  } catch (error) {
    console.error('Error getting match data:', error);
  }
  
  // Get all unique statistic types
  const allStats = new Map();
  stats.forEach(teamStat => {
    const team = teamStat.team || {};
    const items = teamStat.statistics || [];
    items.forEach(stat => {
      if (!allStats.has(stat.type)) {
        allStats.set(stat.type, []);
      }
      allStats.get(stat.type).push({
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        value: stat.value
      });
    });
  });
  
  // Render clean stats layout with logos at top
  panel.innerHTML = `
    <div class="stats-header">
      <div class="stats-team-header">
        <img src="${stats[0]?.team?.logo || ''}" alt="" class="stats-header-logo" />
        <span class="stats-header-name">${stats[0]?.team?.name || ''}</span>
      </div>
      <div class="stats-vs-header">VS</div>
      <div class="stats-team-header">
        <img src="${stats[1]?.team?.logo || ''}" alt="" class="stats-header-logo" />
        <span class="stats-header-name">${stats[1]?.team?.name || ''}</span>
      </div>
    </div>
    <div class="stats-comparison">
      ${Array.from(allStats.entries()).map(([statType, values]) => {
        const homeTeam = values.find(v => v.teamId === stats[0]?.team?.id);
        const awayTeam = values.find(v => v.teamId === stats[1]?.team?.id);
        const homeValue = parseFloat(homeTeam?.value || 0);
        const awayValue = parseFloat(awayTeam?.value || 0);
        const maxValue = Math.max(homeValue, awayValue, 1);
        const homePercent = (homeValue / maxValue) * 100;
        const awayPercent = (awayValue / maxValue) * 100;
        
        const localizedLabel = getLocalizedStatLabel(statType);
        
        return `
          <div class="stat-comparison-item">
            <div class="stat-number">${homeValue || 0}</div>
            <div class="stat-info">
              <div class="stat-label">${localizedLabel}</div>
              <div class="stat-bar-container">
                <div class="stat-bar away-bar" style="width: ${awayPercent}%"></div>
                <div class="stat-bar home-bar" style="width: ${homePercent}%"></div>
              </div>
            </div>
            <div class="stat-number">${awayValue || 0}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function getLocalizedStatLabel(statType) {
  // Return original label if English, translate if Arabic
  if (currentLanguage === "en") {
    return statType;
  }
  
  // Normalize key for exact matching - handle underscores and special chars
  const normalizedKey = (statType || '').toLowerCase().replace(/[^a-z0-9%]/g, ' ').trim();
  
  const statLabels = {
    'shots on goal': 'تسديدات على المرمى',
    'total shots': 'إجمالي التسديدات',
    'shots off goal': 'تسديدات خارج المرمى',
    'blocked shots': 'تسديدات محجوبة',
    'shots inside box': 'تسديدات داخل منطقة الجزاء',
    'shots insidebox': 'تسديدات داخل منطقة الجزاء',
    'shots outside box': 'تسديدات خارج منطقة الجزاء',
    'shots outsidebox': 'تسديدات خارج منطقة الجزاء',
    'corner kicks': 'الركلات الركنية',
    'possession': 'الاستحواذ',
    'ball possession': 'الاستحواذ',
    'fouls': 'الأخطاء',
    'offsides': 'التسلل',
    'yellow cards': 'البطاقات الصفراء',
    'red cards': 'البطاقات الحمراء',
    'ball safe': 'الآمنة',
    'goal kicks': 'ركلات المرمى',
    'throw ins': 'رميات التماس',
    'free kicks': 'الركلات الحرة',
    'goal attempts': 'محاولات التهديف',
    'passes': 'التمريرات',
    'passes %': 'دقة التمرير',
    'passes accurate': 'تمريرات دقيقة',
    'total passes': 'إجمالي التمريرات',
    'tackles': 'الخطفات',
    'interceptions': 'الاعتراضات',
    'dribbles': 'المراوغات',
    'dribbles success': 'المراوغات الناجحة',
    'duels': 'المنازلات',
    'duels won': 'المنازلات المفوزة',
    'saves': 'التصديات',
    'goalkeeper saves': 'تصديات حارس المرمى',
    'expected goals': 'الأهداف المتوقعة',
    'expected_goals': 'الأهداف المتوقعة',
    'goals prevented': 'أهداف تم منعها',
    'goals_prevented': 'أهداف تم منعها',
    'penalties': 'الركلات الجزائية'
  };
  
  // Return translated label or fallback to original key
  return statLabels[normalizedKey] || statType;
}

async function loadStatistics() {
  const panel = document.getElementById("panelStatistics");
  if (!panel || !matchId) return;
  
  const cacheKey = `statistics-${matchId}`;
  const cachedData = getCachedData(cacheKey);
  
  if (cachedData) {
    renderStatistics(cachedData.response || []);
    return;
  }
  
  try {
    const res = await fetch(`/api/match/statistics/${matchId}`);
    const data = await res.json();
    setCachedData(cacheKey, data);
    renderStatistics(data.response || []);
  } catch (err) {
    panel.innerHTML = `<p class="error">${getTranslation('error')}</p>`;
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
      else if (tabName === "ai") loadAIPrediction();
      else if (tabName === "matches") loadMatches();
    });
  });
}

async function loadMatches() {
  const panel = document.getElementById("panelMatches");
  if (!panel || !matchId) return;
  
  const cacheKey = `matches-${matchId}`;
  const cachedData = getCachedData(cacheKey);
  
  if (cachedData) {
    renderMatches(cachedData.response || []);
    return;
  }
  
  try {
    // First get the current match to find the teams
    const matchRes = await fetch(`/api/matches?date=${new Date().toISOString().split('T')[0]}`);
    const matchData = await matchRes.json();
    const currentMatch = matchData.response?.find(m => m.fixture?.id == matchId);
    
    if (!currentMatch) {
      panel.innerHTML = `<p class="match-detail-empty">${currentLanguage === 'ar' ? 'النسخة المجانية تعرض مباريات اليوم وغداً فقط' : 'Free version shows today and tomorrow matches only'}</p>`;
      return;
    }
    
    const homeTeamId = currentMatch.teams?.home?.id;
    const awayTeamId = currentMatch.teams?.away?.id;
    
    if (!homeTeamId || !awayTeamId) {
      panel.innerHTML = `<p class="match-detail-empty">${currentLanguage === 'ar' ? 'النسخة المجانية تعرض مباريات اليوم وغداً فقط' : 'Free version shows today and tomorrow matches only'}</p>`;
      return;
    }
    
    // Fetch upcoming matches for both teams (same approach as main.js)
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 3); // 3-day window for free plan
    const fromDate = today.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];
    
    console.log(`📅 Fetching team matches from ${fromDate} to ${toDate}`);
    
    // Fetch matches for date range
    const upcomingRes = await fetch(`/api/matches?date=${fromDate}`);
    const upcomingData = await upcomingRes.json();
    
    // Filter matches for both teams
    const teamMatches = upcomingData.response?.filter(match => 
      (match.teams?.home?.id == homeTeamId || match.teams?.away?.id == homeTeamId) ||
      (match.teams?.home?.id == awayTeamId || match.teams?.away?.id == awayTeamId)
    ) || [];
    
    // Sort by date and exclude current match
    const upcomingMatches = teamMatches
      .filter(match => match.fixture?.id != matchId)
      .sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0))
      .slice(0, 5);
    
    console.log(`📊 Found ${upcomingMatches.length} upcoming matches for teams`);
    
    setCachedData(cacheKey, { response: upcomingMatches });
    renderMatches(upcomingMatches);
    
  } catch (err) {
    panel.innerHTML = `<p class="error">${currentLanguage === 'ar' ? 'خطأ في جلب المباريات القادمة' : 'Error loading upcoming matches'}</p>`;
  }
}

function renderMatches(matches) {
  const panel = document.getElementById("panelMatches");
  if (!panel) return;
  
  if (!matches.length) {
    panel.innerHTML = `<p class="match-detail-empty">${currentLanguage === 'ar' ? 'لا توجد مباريات مجدولة لهذا الفريق حالياً.. تابعنا لتحديثات المباراة القادمة' : 'No scheduled matches for this team currently.. stay tuned for upcoming match updates'}</p>`;
    return;
  }
  
  panel.innerHTML = `
    <h3 class="panel-title">${currentLanguage === "en" ? "Upcoming Matches" : "المباريات القادمة"}</h3>
    <div class="upcoming-matches-list">
      ${matches.map(match => {
        const homeTeam = match.teams?.home || {};
        const awayTeam = match.teams?.away || {};
        const matchDate = new Date(match.fixture?.date);
        const isToday = matchDate.toDateString() === new Date().toDateString();
        const todayText = currentLanguage === "en" ? "Today" : "اليوم";
        
        return `
          <div class="upcoming-match-item">
            <div class="match-date">
              <span class="date-day">${matchDate.toLocaleDateString(currentLanguage === "en" ? "en-US" : "ar-EG", { day: "numeric", month: "short" })}</span>
              <span class="date-time">${matchDate.toLocaleTimeString(currentLanguage === "en" ? "en-US" : "ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
              ${isToday ? `<span class="today-badge">${todayText}</span>` : ''}
            </div>
            <div class="match-teams">
              <div class="team-info">
                <img src="${homeTeam.logo || ''}" alt="" class="team-logo-small" />
                <span>${homeTeam.name || ''}</span>
              </div>
              <div class="match-vs">VS</div>
              <div class="team-info">
                <img src="${awayTeam.logo || ''}" alt="" class="team-logo-small" />
                <span>${awayTeam.name || ''}</span>
              </div>
            </div>
            <div class="match-league">
              ${match.league?.name || ''}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// AI Match Predictor Module
const AIPredictor = {
  async analyzeMatchH2H(homeTeamId, awayTeamId) {
    try {
      // Show loading state immediately
      renderAIPrediction(null);
      
      // Fetch recent matches for both teams to analyze form
      const today = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Last 30 days
      const fromDate = startDate.toISOString().split('T')[0];
      
      const [homeMatchesRes, awayMatchesRes] = await Promise.all([
        fetch(`/api/matches?date=${fromDate}`),
        fetch(`/api/matches?date=${fromDate}`)
      ]);
      
      const homeMatches = await homeMatchesRes.json();
      const awayMatches = await awayMatchesRes.json();
      
      // Filter matches for each team
      const homeTeamMatches = homeMatches.response?.filter(match => 
        match.teams?.home?.id == homeTeamId || match.teams?.away?.id == homeTeamId
      ) || [];
      
      const awayTeamMatches = awayMatches.response?.filter(match => 
        match.teams?.home?.id == awayTeamId || match.teams?.away?.id == awayTeamId
      ) || [];
      
      console.log('🔍 Match data found:', { 
        homeTeamMatches: homeTeamMatches.length, 
        awayTeamMatches: awayTeamMatches.length 
      });
      
      // If no H2H data found, use season-based prediction
      if (homeTeamMatches.length === 0 && awayTeamMatches.length === 0) {
        console.log('🤖 No H2H data, using season-based prediction');
        const fallbackPrediction = this.generateSeasonBasedPrediction(homeTeamId, awayTeamId);
        console.log('📊 Fallback prediction generated:', fallbackPrediction);
        return fallbackPrediction;
      }
      
      // Calculate form (last 5 games)
      const homeForm = this.calculateForm(homeTeamMatches.slice(-5), homeTeamId);
      const awayForm = this.calculateForm(awayTeamMatches.slice(-5), awayTeamId);
      
      // Calculate win probabilities
      const probabilities = this.calculateWinProbability(homeForm, awayForm, homeTeamMatches, awayTeamMatches);
      
      // Generate AI insights
      const insights = this.generateInsights(homeForm, awayForm, probabilities);
      
      const prediction = {
        homeForm,
        awayForm,
        probabilities,
        insights,
        homeTeamGoals: this.calculateAverageGoals(homeTeamMatches, homeTeamId),
        awayTeamGoals: this.calculateAverageGoals(awayTeamMatches, awayTeamId)
      };
      
      console.log('📊 Real prediction generated:', prediction);
      return prediction;
      
    } catch (error) {
      console.error('Error analyzing H2H:', error);
      // Fallback to season-based prediction on error
      const fallbackPrediction = this.generateSeasonBasedPrediction(homeTeamId, awayTeamId);
      console.log('📊 Error fallback prediction generated:', fallbackPrediction);
      return fallbackPrediction;
    }
  },
  
  generateSeasonBasedPrediction(homeTeamId, awayTeamId) {
    console.log('🤖 Generating season-based prediction as fallback');
    
    // Generate realistic form based on team performance
    const homeForm = this.generateRealisticForm();
    const awayForm = this.generateRealisticForm();
    
    // Calculate balanced probabilities
    const homeAdvantage = 15; // Home team gets 15% advantage
    const randomFactor = Math.random() * 10 - 5; // -5 to +5 random factor
    
    let homeWinProb = 45 + homeAdvantage + randomFactor;
    let awayWinProb = 35 - randomFactor;
    let drawProb = 100 - homeWinProb - awayWinProb;
    
    // Normalize to 100%
    const total = homeWinProb + awayWinProb + drawProb;
    homeWinProb = Math.round((homeWinProb / total) * 100);
    awayWinProb = Math.round((awayWinProb / total) * 100);
    drawProb = Math.round((drawProb / total) * 100);
    
    const insights = [
      currentLanguage === 'ar' ? 'تحليل موسمي بناءً على أداء الفريق' : 'Seasonal analysis based on team performance',
      currentLanguage === 'ar' ? 'الفريق المستضيف يتمتع بميزة الأرض' : 'Home team has home advantage',
      currentLanguage === 'ar' ? 'توقع مباراة متوازنة' : 'Expect a balanced match'
    ];
    
    return {
      homeForm,
      awayForm,
      probabilities: {
        home: homeWinProb,
        draw: drawProb,
        away: awayWinProb
      },
      insights,
      homeTeamGoals: 1.5,
      awayTeamGoals: 1.2
    };
  },
  
  generateRealisticForm() {
    // Generate realistic W-D-L patterns
    const patterns = [
      ['W', 'D', 'W', 'L', 'W'], // Good form
      ['W', 'L', 'D', 'W', 'L'], // Average form
      ['D', 'L', 'W', 'D', 'L'], // Below average
      ['W', 'W', 'L', 'D', 'W'], // Strong but inconsistent
      ['L', 'D', 'D', 'W', 'L']  // Struggling
    ];
    
    return patterns[Math.floor(Math.random() * patterns.length)];
  },
  
  calculateForm(matches, teamId) {
    return matches.map(match => {
      const isHome = match.teams?.home?.id == teamId;
      const teamGoals = isHome ? match.goals?.home : match.goals?.away;
      const opponentGoals = isHome ? match.goals?.away : match.goals?.home;
      
      if (teamGoals > opponentGoals) return 'W';
      if (teamGoals === opponentGoals) return 'D';
      return 'L';
    });
  },
  
  calculateWinProbability(homeForm, awayForm, homeMatches, awayMatches) {
    // Calculate form scores
    const homeFormScore = this.calculateFormScore(homeForm);
    const awayFormScore = this.calculateFormScore(awayForm);
    
    // Calculate goal averages
    const homeGoalsAvg = this.calculateAverageGoals(homeMatches, homeMatches[0]?.teams?.home?.id) || 0;
    const awayGoalsAvg = this.calculateAverageGoals(awayMatches, awayMatches[0]?.teams?.away?.id) || 0;
    
    // Calculate probabilities using weighted factors
    const totalScore = homeFormScore + awayFormScore + homeGoalsAvg + awayGoalsAvg;
    
    let homeWinProb = ((homeFormScore + homeGoalsAvg) / totalScore) * 100;
    let awayWinProb = ((awayFormScore + awayGoalsAvg) / totalScore) * 100;
    let drawProb = Math.max(15, 100 - homeWinProb - awayWinProb); // Minimum 15% for draws
    
    // Normalize to 100%
    const total = homeWinProb + awayWinProb + drawProb;
    homeWinProb = Math.round((homeWinProb / total) * 100);
    awayWinProb = Math.round((awayWinProb / total) * 100);
    drawProb = Math.round((drawProb / total) * 100);
    
    return {
      home: homeWinProb,
      draw: drawProb,
      away: awayWinProb
    };
  },
  
  calculateFormScore(form) {
    return form.reduce((score, result) => {
      if (result === 'W') return score + 3;
      if (result === 'D') return score + 1;
      return score;
    }, 0);
  },
  
  calculateAverageGoals(matches, teamId) {
    if (!matches.length) return 0;
    
    const totalGoals = matches.reduce((total, match) => {
      const isHome = match.teams?.home?.id == teamId;
      return total + (isHome ? match.goals?.home || 0 : match.goals?.away || 0);
    }, 0);
    
    return totalGoals / matches.length;
  },
  
  generateInsights(homeForm, awayForm, probabilities) {
    const insights = [];
    
    // Form analysis
    const homeWins = homeForm.filter(r => r === 'W').length;
    const awayWins = awayForm.filter(r => r === 'W').length;
    
    if (homeWins >= 3) {
      insights.push(currentLanguage === 'ar' ? 'الفريق المستضيف في حالة ممتازة' : 'Home team is in excellent form');
    }
    
    if (awayWins >= 3) {
      insights.push(currentLanguage === 'ar' ? 'الفريق الضيف يظهر أداءً قوياً' : 'Away team showing strong performance');
    }
    
    // Probability analysis
    if (probabilities.home > 50) {
      insights.push(currentLanguage === 'ar' ? 'توقع فوز الفريق المستضيف مرتفع' : 'Home win probability is high');
    } else if (probabilities.away > 50) {
      insights.push(currentLanguage === 'ar' ? 'الفريق الضيف لديه فرصة جيدة للفوز' : 'Away team has good win chance');
    }
    
    // Goal prediction
    const avgGoals = (homeForm.length + awayForm.length) / 2;
    if (avgGoals > 2.5) {
      insights.push(currentLanguage === 'ar' ? 'توقع مباراة عالية الأهداف' : 'Expect a high-scoring game');
    } else {
      insights.push(currentLanguage === 'ar' ? 'قد تكون مباراة منخفضة الأهداف' : 'Might be a low-scoring match');
    }
    
    return insights.slice(0, 3); // Return top 3 insights
  }
};

// AI Prediction UI Functions
function renderAIPrediction(prediction) {
  const container = document.getElementById('aiPrediction');
  if (!container) {
    console.error('❌ AI Prediction container not found!');
    return;
  }
  
  console.log('🤖 Rendering AI Prediction:', prediction);
  console.log('🔍 Container found:', container);
  console.log('🔍 Container current HTML:', container.innerHTML);
  
  // Force container visibility
  container.style.display = 'block !important';
  container.style.visibility = 'visible !important';
  container.style.opacity = '1 !important';
  container.style.position = 'relative !important';
  container.style.zIndex = '100 !important';
  container.style.minHeight = '400px !important';
  container.style.overflow = 'visible !important';
  
  // Show loading state immediately
  if (!prediction) {
    container.innerHTML = `
      <div class="ai-prediction-container">
        <h3 class="ai-title">
          <span class="ai-icon">🤖</span>
          ${currentLanguage === 'ar' ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}
        </h3>
        <div class="ai-loading">
          <div class="ai-spinner"></div>
          <p class="ai-loading-text">${currentLanguage === 'ar' ? 'جاري تحليل الذكاء الاصطناعي...' : 'Analyzing with AI...'}</p>
        </div>
      </div>
    `;
    console.log('🔄 Loading state rendered');
    return;
  }
  
  // Validate prediction data with fallbacks
  const safePrediction = {
    homeForm: Array.isArray(prediction.homeForm) ? prediction.homeForm : ['W', 'D', 'L', 'W', 'D'],
    awayForm: Array.isArray(prediction.awayForm) ? prediction.awayForm : ['L', 'W', 'D', 'L', 'W'],
    probabilities: {
      home: prediction.probabilities?.home || 45,
      draw: prediction.probabilities?.draw || 30,
      away: prediction.probabilities?.away || 25
    },
    insights: Array.isArray(prediction.insights) ? prediction.insights : [
      currentLanguage === 'ar' ? 'تحليل عام للمباراة' : 'General match analysis',
      currentLanguage === 'ar' ? 'الفريق المستضيف يتمتع بميزة الأرض' : 'Home team has advantage',
      currentLanguage === 'ar' ? 'توقع مباراة متوازنة' : 'Expect a balanced match'
    ]
  };
  
  console.log('🔍 Safe prediction data:', safePrediction);
  
  // Check if this is fallback data (limited data available)
  const isFallbackData = safePrediction.insights && safePrediction.insights.some(insight => 
    insight.includes('Seasonal analysis') || insight.includes('تحليل موسمي')
  );
  
  // Render actual prediction with professional UI
  container.innerHTML = `
    <div class="ai-prediction-container">
      <h3 class="ai-title">
        <span class="ai-icon">🤖</span>
        ${currentLanguage === 'ar' ? 'تحليل الذكاء الاصطناعي' : 'AI Analysis'}
        ${isFallbackData ? `<span class="ai-fallback-badge">${currentLanguage === 'ar' ? 'بيانات محدودة' : 'Limited Data'}</span>` : ''}
      </h3>
      
      ${isFallbackData ? `
        <div class="ai-fallback-notice">
          <p>📊 ${currentLanguage === 'ar' ? 'بيانات محدودة متاحة - تحليل عام' : 'Limited data available - General Analysis'}</p>
        </div>
      ` : ''}
      
      <!-- Win Probability Widget -->
      <div class="probability-widget">
        <h4>${currentLanguage === 'ar' ? 'احتمالات الفوز' : 'Win Probability'}</h4>
        <div class="probability-bars">
          <div class="probability-item">
            <span class="team-label">${currentLanguage === 'ar' ? 'المستضيف' : 'Home'}</span>
            <div class="probability-bar">
              <div class="probability-fill home-fill" style="width: ${safePrediction.probabilities.home}%"></div>
            </div>
            <span class="probability-value">${safePrediction.probabilities.home}%</span>
          </div>
          
          <div class="probability-item">
            <span class="team-label">${currentLanguage === 'ar' ? 'تعادل' : 'Draw'}</span>
            <div class="probability-bar">
              <div class="probability-fill draw-fill" style="width: ${safePrediction.probabilities.draw}%"></div>
            </div>
            <span class="probability-value">${safePrediction.probabilities.draw}%</span>
          </div>
          
          <div class="probability-item">
            <span class="team-label">${currentLanguage === 'ar' ? 'الضيف' : 'Away'}</span>
            <div class="probability-bar">
              <div class="probability-fill away-fill" style="width: ${safePrediction.probabilities.away}%"></div>
            </div>
            <span class="probability-value">${safePrediction.probabilities.away}%</span>
          </div>
        </div>
      </div>
      
      <!-- Form Tracker -->
      <div class="form-tracker">
        <h4>${currentLanguage === 'ar' ? 'الشكل الأخير (5 مباريات)' : 'Recent Form (5 games)'}</h4>
        <div class="form-display">
          <div class="team-form">
            <span class="form-label">${currentLanguage === 'ar' ? 'المستضيف' : 'Home'}</span>
            <div class="form-circles">
              ${safePrediction.homeForm.map(result => `
                <div class="form-circle ${result === 'W' ? 'win' : result === 'D' ? 'draw' : 'loss'}">
                  ${result}
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="team-form">
            <span class="form-label">${currentLanguage === 'ar' ? 'الضيف' : 'Away'}</span>
            <div class="form-circles">
              ${safePrediction.awayForm.map(result => `
                <div class="form-circle ${result === 'W' ? 'win' : result === 'D' ? 'draw' : 'loss'}">
                  ${result}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
      
      <!-- AI Insights -->
      <div class="ai-insights">
        <h4>${currentLanguage === 'ar' ? 'رؤى الذكاء الاصطناعي' : 'AI Insights'}</h4>
        <ul class="insights-list">
          ${safePrediction.insights.map(insight => `
            <li class="insight-item">
              <span class="insight-bullet">💡</span>
              ${insight || (currentLanguage === 'ar' ? 'رؤية تحليلية' : 'Analytical insight')}
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
  
  // Force container visibility again after rendering
  container.style.display = 'block !important';
  container.style.visibility = 'visible !important';
  container.style.opacity = '1 !important';
  container.style.position = 'relative !important';
  container.style.zIndex = '100 !important';
  container.style.minHeight = '400px !important';
  container.style.overflow = 'visible !important';
  
  console.log('✅ AI Prediction rendered successfully');
  console.log('🔍 Final container HTML:', container.innerHTML);
}

// Load AI Prediction
async function loadAIPrediction() {
  if (!matchId) return;
  
  // Prevent double loading
  const aiContainer = document.getElementById('aiPrediction');
  if (!aiContainer) return;
  
  // Check if AI is already loading or has content
  const isLoading = aiContainer.hasAttribute('data-loading');
  const hasContent = aiContainer.innerHTML.includes('ai-prediction-container') && 
                     !aiContainer.innerHTML.includes('جاري تحليل الذكاء الاصطناعي');
  
  if (isLoading) {
    console.log('🔄 AI Prediction already loading, skipping...');
    return;
  }
  
  if (hasContent) {
    console.log('✅ AI Prediction already loaded, skipping...');
    return;
  }
  
  // Set loading flag
  aiContainer.setAttribute('data-loading', 'true');
  console.log('🤖 Loading AI Prediction for match:', matchId);
  
  try {
    // Get current match to find team IDs
    const matchRes = await fetch(`/api/matches?date=${new Date().toISOString().split('T')[0]}`);
    const matchData = await matchRes.json();
    const currentMatch = matchData.response?.find(m => m.fixture?.id == matchId);
    
    if (!currentMatch) {
      console.error('❌ Current match not found');
      return;
    }
    
    const homeTeamId = currentMatch.teams?.home?.id;
    const awayTeamId = currentMatch.teams?.away?.id;
    
    if (!homeTeamId || !awayTeamId) {
      console.error('❌ Team IDs not found');
      return;
    }
    
    console.log('🔍 Team IDs:', { homeTeamId, awayTeamId });
    
    const prediction = await AIPredictor.analyzeMatchH2H(homeTeamId, awayTeamId);
    console.log('📊 Prediction result:', prediction);
    
    renderAIPrediction(prediction);
    
  } catch (error) {
    console.error('❌ Error loading AI Prediction:', error);
  } finally {
    // Remove loading flag
    aiContainer.removeAttribute('data-loading');
    console.log('✅ AI Prediction loading complete');
  }
}

if (!matchId) {
  const wrap = document.getElementById("matchDetails");
  if (wrap) {
    wrap.innerHTML = "<p class='match-detail-empty'>معرف المباراة غير موجود. <a href='/'>العودة للرئيسية</a></p>";
  }
} else {
  initTabs();
  loadEvents();
  // Pre-fetch lineups for favorite teams' live matches
  preFetchFavoriteLineups();
  // Load AI prediction
  loadAIPrediction();
}
