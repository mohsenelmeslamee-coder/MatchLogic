let currentPage = "today";
// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Data Service Module
const DataService = {
    async fetchMatches(date) {
        const res = await fetch(`/api/matches?date=${date}`);
        return await res.json();
    },
    
    async fetchTeamSchedule(teamId, fromDate, toDate) {
        const upcomingRes = await this.fetchMatches(fromDate);
        const recentRes = await this.fetchMatches(toDate);
        
        const teamUpcomingMatches = upcomingRes.response?.filter(match => 
            match.teams?.home?.id == teamId || match.teams?.away?.id == teamId
        ) || [];
        
        const teamRecentMatches = recentRes.response?.filter(match => 
            match.teams?.home?.id == teamId || match.teams?.away?.id == teamId
        ) || [];
        
        return { upcoming: teamUpcomingMatches, recent: teamRecentMatches };
    }
};

// Favorites Manager Module - Optimized for Match IDs only
const FavoritesManager = {
    get() {
        const favorites = localStorage.getItem('matchlogic_favorite_teams');
        return favorites ? JSON.parse(favorites) : [];
    },
    
    add(team) {
        const favorites = this.get();
        // Only store essential data: ID and name
        const favoriteTeam = {
            id: team.id,
            name: team.name
        };
        favorites.push(favoriteTeam);
        localStorage.setItem('matchlogic_favorite_teams', JSON.stringify(favorites));
    },
    
    remove(teamId) {
        let favorites = this.get();
        favorites = favorites.filter(team => team.id !== teamId);
        localStorage.setItem('matchlogic_favorite_teams', JSON.stringify(favorites));
    },
    
    // New method to get just IDs for efficient filtering
    getIds() {
        return this.get().map(team => team.id);
    }
};

// Match UI Module
const MatchUI = {
    displayEmptyState(container, message) {
        container.innerHTML = `<p class="no-results">${message}</p>`;
    },
    
    showLoading(container) {
        container.innerHTML = `<p class="loading">${translations[currentLanguage].loading}</p>`;
    }
};

let currentLanguage = localStorage.getItem("lang") || "ar";

// Elite Leagues Configuration - ONLY Major Senior Professional Leagues
const ELITE_LEAGUES = {
    // Top European Leagues
    'Premier League': 39,
    'La Liga': 140,
    'Serie A': 135,
    'Bundesliga': 78,
    'Ligue 1': 61,
    'Eredivisie': 88,
    'Primeira Liga': 94,
    
    // UEFA Competitions
    'UEFA Champions League': 2,
    'UEFA Europa League': 3,
    'UEFA Europa Conference League': 4,
    
    // Major Arab Leagues
    'Egyptian Premier League': 848,
    'Saudi Pro League': 307,
    'Qatar Stars League': 189,
    'UAE Pro League': 192,
    'Moroccan Botola': 193,
    'Algerian Ligue 1': 194,
    'Tunisian Ligue 1': 195,
    
    // Major South American
    'Brasileirão Serie A': 71,
    'Liga Profesional Argentina': 128,
    
    // Scottish Premiership (for Celtic)
    'Scottish Premiership': 50,
    
    // Major International
    'World Cup': 4,
    'European Championship': 1,
    'Copa America': 5
};

// Youth and lower-tier leagues to auto-hide (Global Pro Filter)
const HIDDEN_LEAGUES = [
    // Youth/Junior Terms
    'U17', 'U18', 'U19', 'U20', 'U21', 'U22', 'U23',
    'Youth', 'Junior', 'Juniors', 'Under-17', 'Under-18', 'Under-19', 'Under-20', 'Under-21', 'Under-22', 'Under-23',
    
    // Women's Terms
    'Women', 'Woman', 'Female', 'Feminino', 'Liga F', 'FA WSL', 'NWSL', 'Damallsvenskan',
    
    // Lower-Tier Terms
    'Division 2', 'Division 3', 'League Two', 'League One', 'Serie B', 'Bundesliga 2',
    'Ligue 2', 'Segunda División', 'Serie C', 'Third Division', 'Fourth Division',
    
    // Reserve/Amateur Terms
    'Reserve', 'Reserves', 'Amateur', 'Semi-Professional', 'Semi-Pro',
    'B Team', 'B-Team', 'Academy', 'Academies',
    
    // Regional/Minor Terms
    'Regional', 'Regional League', 'County', 'District', 'Amateur League',
    'Lower League', 'Minor League', 'Development League'
];

// Arabic to English Team Name Mapping
const ARABIC_TEAM_MAPPING = {
    // Premier League
    'أرسنال': 'Arsenal',
    'مانشستر سيتي': 'Manchester City',
    'مانشستر يونايتد': 'Manchester United',
    'ليفربول': 'Liverpool',
    'تشيلسي': 'Chelsea',
    'توتنهام': 'Tottenham',
    'برايتون': 'Brighton',
    'كريستال بالاس': 'Crystal Palace',
    'فولهام': 'Fulham',
    'برينتفورد': 'Brentford',
    'إيفرتون': 'Everton',
    'ليستر سيتي': 'Leicester City',
    'لوتون تاون': 'Luton Town',
    'نوتنغهام فورست': 'Nottingham Forest',
    'شيفيلد يونايتد': 'Sheffield United',
    'برنلي': 'Burnley',
    'وست بروميتش': 'West Bromwich',
    'نوتس كاونتي': 'Notts County',
    'دربي كاونتي': 'Derby County',
    
    // La Liga
    'ريال مدريد': 'Real Madrid',
    'برشلونة': 'Barcelona',
    'أتليتكو مدريد': 'Atletico Madrid',
    'فالنسيا': 'Valencia',
    'أتلتيك بلباو': 'Athletic Bilbao',
    'ريال سوسيداد': 'Real Sociedad',
    'فياريال': 'Villarreal',
    'ريال بيتيس': 'Real Betis',
    'إشبيلية': 'Espanyol',
    'سيلتا فيغو': 'Celta Vigo',
    'خيتافي': 'Getafe',
    'ألمرية': 'Almeria',
    'ريال مايوركا': 'Real Mallorca',
    'رايو فايكانو': 'Rayo Vallecano',
    'غرناطة': 'Granada',
    'أوساسونا': 'Osasuna',
    'لاس بالماس': 'Las Palmas',
    
    // Serie A
    'يوفنتوس': 'Juventus',
    'إنتر ميلان': 'Inter Milan',
    'ميلان': 'AC Milan',
    'نابولي': 'Napoli',
    'روما': 'Roma',
    'لاتسيو': 'Lazio',
    'فيورنتينا': 'Fiorentina',
    'أتالانتا': 'Atalanta',
    'تورينو': 'Torino',
    'سامبدوريا': 'Sampdoria',
    'بولونيا': 'Bologna',
    'جنوى': 'Genoa',
    'هيلاس فيرونا': 'Hellas Verona',
    'أودينيزي كالشيو': 'Udinese Calcio',
    'مونتزا': 'Monza',
    'إمبولي': 'Empoli',
    'ليتشي': 'Lecce',
    'كالياري': 'Cagliari',
    'فروزينوني': 'Frosinone',
    'ساليرنيتانا': 'Salernitana',
    
    // Bundesliga
    'بايرن ميونخ': 'Bayern Munich',
    'بوروسيا دورتموند': 'Borussia Dortmund',
    'باير ليفركوزن': 'Bayer Leverkusen',
    'آينتراخت فرانكفورت': 'Eintracht Frankfurt',
    'فيردر بريمن': 'Werder Bremen',
    'بوروسيا مونشنجلادباخ': 'Borussia Mönchengladbach',
    'تي إس كيه': 'TSG Hoffenheim',
    'فرايبورغ': 'Freiburg',
    'يونيون برلين': 'Union Berlin',
    'أوغسبورغ': 'Augsburg',
    'شتوتغارت': 'Stuttgart',
    'ماينتس': 'Mainz',
    'كولن': 'Köln',
    'فولفسبورغ': 'Wolfsburg',
    'هولشتاين كيل': 'Holstein Kiel',
    'بروسيا دورتموند 2': 'Borussia Dortmund II',
    
    // Ligue 1
    'باريس سان جيرمان': 'Paris Saint-Germain',
    'مرسيليا': 'Marseille',
    'موناكو': 'Monaco',
    'ليون': 'Lyon',
    'ليل': 'Lille',
    'رين': 'Rennes',
    'نيس': 'Nice',
    'ستراسبورغ': 'Strasbourg',
    'مونبيلييه': 'Montpellier',
    'بوردو': 'Bordeaux',
    'لانس': 'Lens',
    'نانت': 'Nantes',
    'تولوز': 'Toulouse',
    'كليرمون فوت': 'Clermont Foot',
    'بريست': 'Brest',
    'أجاكسيو': 'Ajaccio',
    'لوريان': 'Lorient',
    'راي فالي': 'Reims',
    'لوهافر': 'Le Havre',
    'ميتز': 'Metz',
    
    // Egyptian League
    'الأهلي': 'Al Ahly',
    'الزمالك': 'Zamalek',
    'بيراميدز': 'Pyramids',
    'إنبي': 'ENPPI',
    'سيراميكا كليوباترا': 'Ceramica Cleopatra',
    'مصر للمقاصن': 'Egypt for Production',
    'الجونة': 'El Gouna',
    'سموحة': 'Smouha',
    'غزل المحلة': 'Ghazl El Mahalla',
    'طلائع الجيش': 'Talae El Gaish',
    'الإسماعيلي': 'Ismaily',
    'الاتحاد السكندري': 'Al Ittihad',
    'الاسماعيلي': 'Ismaily SC',
    'المقاولون العرب': 'Al Mokawloon Al Arab',
    'البتروج': 'Al Petrol',
    'الداخلية': 'Al Dakhleya',
    'السكة': 'Seka',
    'الترجي': 'Al Taaji',
    'الإسماعيلي': 'Ismaily',
    
    // Saudi League
    'الهلال': 'Al Hilal',
    'النصر': 'Al Nassr',
    'الاتحاد': 'Al Ittihad',
    'الشباب': 'Al Shabab',
    'الأهلي': 'Al Ahli Saudi',
    'التعاون': 'Al Taawoun',
    'الفيصلي': 'Al Faisaly',
    'الرائد': 'Al Raed',
    'الخليج': 'Al Khaleej',
    'الوحده': 'Al Wehda',
    'الفتح': 'Al Fateh',
    'الجبلين': 'Al Jabalain',
    'العدالة': 'Al Adalah',
    'الطائي': 'Al Tai',
    'حطين': 'Hattin',
    'الجيل': 'Al Jeel',
    'الأنوار': 'Al Anwar',
    'الرياض': 'Al Riyadh',
    'الخالدية': 'Al Kholood',
    'الفيحاء': 'Al Feiha',
    'الدرع': 'Al Deraa',
    'السدوس': 'Al Safa',
    'القادسية': 'Al Qadsiah',
    'الجوهرة': 'Al Jawhara',
    'النهضة': 'Al Nahda',
    'الشعلة': 'Al Shoalah',
    'الرجاء': 'Al Rajaa',
    'البدائع': 'Al Badaei',
    'الساحل': 'Al Sahel',
    'الفيصل': 'Al Faisaly',
    'النور': 'Al Nojoom',
    'الوحدة': 'Al Wehdah',
    'الترجي': 'Al Taaji',
    'الإسماعيلي': 'Ismaily',
};

// Enhanced search function with Arabic support
function searchTeam(query, teamName) {
    const searchLower = query.toLowerCase();
    const teamLower = teamName.toLowerCase();
    
    // Direct English match
    if (teamLower.includes(searchLower)) {
        return true;
    }
    
    // Arabic to English mapping
    const arabicQuery = query.trim();
    if (ARABIC_TEAM_MAPPING[arabicQuery]) {
        const englishEquivalent = ARABIC_TEAM_MAPPING[arabicQuery].toLowerCase();
        return teamLower.includes(englishEquivalent);
    }
    
    // Fuzzy Arabic matching (partial matches)
    for (const [arabic, english] of Object.entries(ARABIC_TEAM_MAPPING)) {
        if (arabic.includes(arabicQuery) || arabicQuery.includes(arabic)) {
            const englishEquivalent = english.toLowerCase();
            if (teamLower.includes(englishEquivalent)) {
                return true;
            }
        }
    }
    
    return false;
}

// Smart Filtering Functions
function isEliteLeague(match) {
    if (!match.league) return false;
    
    const leagueName = match.league.name;
    const leagueId = match.league.id;
    
    // STRICT WHITELIST: Only allow exact matches from ELITE_LEAGUES
    const isWhitelisted = Object.values(ELITE_LEAGUES).includes(leagueId);
    
    // Additional check: Exclude any league with U20/Women in the name
    const hasHiddenTerms = HIDDEN_LEAGUES.some(hidden => 
        leagueName.toLowerCase().includes(hidden.toLowerCase())
    );
    
    return isWhitelisted && !hasHiddenTerms;
}

function shouldHideLeague(match) {
    if (!match.league) return true; // Hide if no league info
    
    const leagueName = match.league.name.toLowerCase();
    
    // Hide youth and lower-tier leagues
    return HIDDEN_LEAGUES.some(hidden => 
        leagueName.includes(hidden.toLowerCase())
    );
}

// GLOBAL PRO FILTER - Clean professional UI
function isProfessionalMatch(match) {
    if (!match || !match.league) return false;
    
    const leagueName = match.league.name.toLowerCase();
    
    // Check if league contains hidden terms
    const hasHiddenTerms = HIDDEN_LEAGUES.some(hidden => 
        leagueName.includes(hidden.toLowerCase())
    );
    
    // Return true if NOT hidden (i.e., professional)
    return !hasHiddenTerms;
}

function applyGlobalProFilter(matches, searchQuery = '') {
    console.log('🏆 Applying Global Pro Filter to', matches.length, 'matches');
    
    let filtered = matches.filter(match => {
        // Always filter out invalid matches
        if (!match || !match.league) return false;
        
        // Global Pro Filter: Hide youth/junior/women matches
        const isProfessional = isProfessionalMatch(match);
        
        // Search Exception: If searching, show matches that match search even if hidden
        if (searchQuery && searchQuery.trim()) {
            const homeTeam = match.teams?.home?.name || '';
            const awayTeam = match.teams?.away?.name || '';
            const leagueName = match.league?.name || '';
            
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch = homeTeam.toLowerCase().includes(searchLower) ||
                                 awayTeam.toLowerCase().includes(searchLower) ||
                                 leagueName.toLowerCase().includes(searchLower);
            
            // If searching and matches search term, show even if youth/junior
            return matchesSearch;
        }
        
        // Otherwise, only show professional matches
        return isProfessional;
    });
    
    console.log('🏆 Global Pro Filter result:', filtered.length, 'from', matches.length);
    return filtered;
}

function filterMatches(matches, filter = 'elite') {
    if (!matches) return [];
    
    let filtered = matches;
    
    if (filter === 'elite') {
        filtered = matches.filter(match => 
            isEliteLeague(match) && !shouldHideLeague(match)
        );
        
        // Smart Combined Logic: Prioritize live elite matches
        const liveElite = filtered.filter(match => isLiveMatch(match));
        
        const upcomingElite = filtered.filter(match => !isLiveMatch(match));
        
        // If elite matches are live, show live first, then upcoming
        return [...liveElite, ...upcomingElite];
    }
    
    // Always prioritize live matches
    const live = filtered.filter(match => isLiveMatch(match));
    
    const notLive = filtered.filter(match => !isLiveMatch(match));
    
    return [...live, ...notLive];
}

function isLiveMatch(match) {
    if (!match || !match.fixture || !match.fixture.status) {
        return false; // STRICT FALSE - no null results
    }
    
    const statusShort = match.fixture.status.short;
    
    // PERFORMANCE OPTIMIZATION: Skip live check for NS/FT immediately
    if (statusShort === 'NS' || statusShort === 'FT' || statusShort === 'AET' || 
        statusShort === 'PEN' || statusShort === 'PST') {
        return false;
    }
    
    // ONLY run live check for potentially live statuses
    const statusLong = match.fixture.status.long;
    const statusElapsed = match.fixture.status.elapsed;
    
    // STRICT LIVE CHECK: Only return true for actual live statuses
    const isLive = statusShort === 'LIVE' || 
                   statusShort === 'HT' ||
                   statusShort === '1H' ||
                   statusShort === '2H' ||
                   statusShort === 'ET' ||
                   statusShort === 'P' ||
                   (statusLong && (
                       statusLong.toLowerCase().includes('live') ||
                       statusLong.includes('مباشر') ||
                       statusLong.includes('الشوط الأول') ||
                       statusLong.includes('استراحة')
                   )) ||
                   (statusElapsed && statusElapsed > 0 && statusElapsed < 120); // Minutes 1-119
    
    const result = isLive;
    console.log('🎯 Live match result:', result, '(status:', statusShort, ')');
    return result;
}

function updateLiveMatches(matches) {
    liveMatches = matches.filter(match => isLiveMatch(match));
}

// Cache Management Functions - Optimized with different durations
function cacheMatches(matches, date) {
    // Date-partitioned cache: matchCache[date]
    if (!window.matchCache) {
        window.matchCache = {};
    }
    
    const cacheData = {
        matches: matches,
        timestamp: Date.now(),
        date: date
    };
    
    window.matchCache[date] = cacheData;
    console.log(`💾 Cached ${matches.length} matches for date: ${date}`);
}

function getCachedData(date) {
    if (!window.matchCache || !window.matchCache[date]) {
        return null;
    }
    
    const cacheData = window.matchCache[date];
    const cacheAge = Date.now() - cacheData.timestamp;
    
    // Different cache durations based on match status
    const hasLiveMatches = cacheData.matches.some(match => isLiveMatch(match));
    const maxAge = hasLiveMatches ? 2 * 60 * 1000 : 5 * 60 * 1000; // 2 min for live, 5 min for others
    
    if (cacheAge > maxAge) {
        console.log(`🗑️ Cache expired for date: ${date} (${hasLiveMatches ? 'live' : 'regular'} matches)`);
        delete window.matchCache[date];
        return null;
    }
    
    console.log(`📋 Retrieved ${cacheData.matches.length} cached matches for date: ${date}`);
    return cacheData.matches;
}

// Favorite Team Schedule Functions
let currentTeamSchedule = [];
let currentTeamName = '';

function openTeamScheduleModal(teamName, teamId) {
    currentTeamName = teamName;
    document.getElementById('modalTeamName').textContent = teamName;
    document.getElementById('teamScheduleModal').style.display = 'block';
    
    // Load team schedule
    loadTeamSchedule(teamId);
}

function closeTeamScheduleModal() {
    document.getElementById('teamScheduleModal').style.display = 'none';
    currentTeamSchedule = [];
    currentTeamName = '';
}

function showScheduleTab(tab) {
    const upcomingTab = document.getElementById('upcomingTab');
    const recentTab = document.getElementById('recentTab');
    const upcomingContent = document.getElementById('upcomingMatches');
    const recentContent = document.getElementById('recentResults');
    
    if (tab === 'upcoming') {
        upcomingTab.classList.add('active');
        recentTab.classList.remove('active');
        upcomingContent.style.display = 'block';
        recentContent.style.display = 'none';
    } else {
        upcomingTab.classList.remove('active');
        recentTab.classList.add('active');
        upcomingContent.style.display = 'none';
        recentContent.style.display = 'block';
    }
}

async function loadTeamSchedule(teamId) {
    try {
        console.log(`📅 Loading team schedule for teamId: ${teamId}`);
        
        // Use same approach as main page - 3-day window for free plan
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + 3); // 3-day window for free plan
        
        const fromDate = today.toISOString().split('T')[0];
        const toDate = endDate.toISOString().split('T')[0];
        
        console.log(`📅 Fetching matches from ${fromDate} to ${toDate}`);
        
        // Fetch all matches for date range (same as main page)
        const upcomingRes = await fetch(`/api/matches?date=${fromDate}`);
        const upcomingData = await upcomingRes.json();
        
        // Filter matches for this specific team
        const teamUpcomingMatches = upcomingData.response?.filter(match => 
            match.teams?.home?.id == teamId || match.teams?.away?.id == teamId
        ) || [];
        
        console.log(`📊 Upcoming matches for team ${teamId}: ${teamUpcomingMatches.length}`);
        
        // Fetch recent matches (last 3 days)
        const startDate = new Date();
        startDate.setDate(today.getDate() - 3); // Last 3 days for free plan
        const fromRecentDate = startDate.toISOString().split('T')[0];
        
        const recentRes = await fetch(`/api/matches?date=${fromRecentDate}`);
        const recentData = await recentRes.json();
        
        // Filter recent matches for this team
        const teamRecentMatches = recentData.response?.filter(match => 
            match.teams?.home?.id == teamId || match.teams?.away?.id == teamId
        ) || [];
        
        console.log(`📊 Recent matches for team ${teamId}: ${teamRecentMatches.length}`);
        
        // Display matches
        displayUpcomingMatches(teamUpcomingMatches.slice(0, 5));
        displayRecentResults(teamRecentMatches.slice(-5).reverse());
        
    } catch (error) {
        console.error('Error loading team schedule:', error);
        document.getElementById('upcomingMatches').innerHTML = `<p class="error">${currentLanguage === 'ar' ? 'خطأ في تحميل الجدول' : 'Error loading schedule'}</p>`;
        document.getElementById('recentResults').innerHTML = `<p class="error">${currentLanguage === 'ar' ? 'خطأ في تحميل النتائج' : 'Error loading results'}</p>`;
    }
}

function displayUpcomingMatches(matches) {
const container = document.getElementById('upcomingMatches');
container.innerHTML = '';

if (!matches.length) {
    container.innerHTML = `<p class="no-results">${currentLanguage === 'ar' ? 'لا توجد مباريات مجدولة لهذا الفريق حالياً.. تابعنا لتحديثات المباراة القادمة' : 'No scheduled matches for this team currently.. stay tuned for upcoming match updates'}</p>`;
    return;
}

matches.forEach(match => {
    const matchDiv = document.createElement('div');
    matchDiv.className = 'team-schedule-match';

    const matchDate = new Date(match.fixture.date);
    const dateStr = matchDate.toLocaleDateString(currentLanguage === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
    const timeStr = matchDate.toLocaleTimeString(currentLanguage === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });

    matchDiv.innerHTML = `
        <div class="schedule-match-header">
            <span class="schedule-match-date">${dateStr}</span>
            <span class="schedule-match-time">${timeStr}</span>
        </div>
        <div class="schedule-match-teams">
            <div class="schedule-match-team">
                <img src="${match.teams.home.logo}" alt="${match.teams.home.name}" onerror="handleImageError(this)" />
                <span>${match.teams.home.name}</span>
            </div>
            <span class="schedule-match-vs">${currentLanguage === 'ar' ? 'ضد' : 'VS'}</span>
            <div class="schedule-match-team">
                <img src="${match.teams.away.logo}" alt="${match.teams.away.name}" onerror="handleImageError(this)" />
                <span>${match.teams.away.name}</span>
            </div>
        </div>
        <div class="schedule-match-league">${match.league?.name || ''}</div>
    `;

    container.appendChild(matchDiv);
});
}

function displayRecentResults(matches) {
    const container = document.getElementById('recentResults');
    container.innerHTML = '';
    
    if (!matches.length) {
        container.innerHTML = `<p class="no-results">${currentLanguage === 'ar' ? 'لا توجد مباريات مجدولة لهذا الفريق حالياً.. تابعنا لتحديثات المباراة القادمة' : 'No scheduled matches for this team currently.. stay tuned for upcoming match updates'}</p>`;
        return;
    }
    
    matches.forEach(match => {
        const matchDiv = document.createElement('div');
        matchDiv.className = 'team-schedule-match';
        
        const matchDate = new Date(match.fixture.date);
        const dateStr = matchDate.toLocaleDateString(currentLanguage === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
        const scoreText = `${match.goals?.home ?? 0} - ${match.goals?.away ?? 0}`;
        
        matchDiv.innerHTML = `
            <div class="schedule-match-header">
                <span class="schedule-match-date">${dateStr}</span>
                <span class="schedule-match-time">${scoreText}</span>
            </div>
            <div class="schedule-match-teams">
                <div class="schedule-match-team">
                    <img src="${match.teams.home.logo}" alt="${match.teams.home.name}" onerror="handleImageError(this)" />
                    <span>${match.teams.home.name}</span>
                </div>
                <span class="schedule-match-vs">${currentLanguage === 'ar' ? 'ضد' : 'VS'}</span>
                <div class="schedule-match-team">
                    <img src="${match.teams.away.logo}" alt="${match.teams.away.name}" onerror="handleImageError(this)" />
                    <span>${match.teams.away.name}</span>
                </div>
            </div>
            <div class="schedule-match-league">${match.league?.name || ''}</div>
        `;
        
        container.appendChild(matchDiv);
    });
}

// Enhanced match card click handler for favorites
function createFavoriteMatchCard(match) {
    const card = document.createElement("div");
    card.className = "match-card favorite-match";
    
    const statusShort = match.fixture?.status?.short;
    const favoriteTeams = getFavoriteTeams();
    const isFavoriteMatch = favoriteTeams.some(t => t.id === match.teams?.home?.id) || favoriteTeams.some(t => t.id === match.teams?.away?.id);
    
    // Add click handler for team schedule
    card.addEventListener("click", (e) => {
        e.stopPropagation();
        
        // Determine which team was clicked based on click position
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const teamWidth = rect.width / 2;
        
        if (x < teamWidth) {
            // Home team clicked
            openTeamScheduleModal(match.teams.home.name, match.teams.home.id);
        } else {
            // Away team clicked
            openTeamScheduleModal(match.teams.away.name, match.teams.away.id);
        }
    });
    
    return card;
}

// Notification & Live Priority System
let favoriteTeams = JSON.parse(localStorage.getItem('favoriteTeams') || '[]');
let liveUpdateInterval = null;

function startLiveUpdateSystem() {
    // Clear existing interval
    if (liveUpdateInterval) {
        clearInterval(liveUpdateInterval);
    }
    
    // Check for live updates every 60 seconds
    liveUpdateInterval = setInterval(() => {
        checkFavoriteTeamsUpdates();
    }, 60000);
    
    console.log('🔄 Live update system started (60-second intervals)');
}

function checkFavoriteTeamsUpdates() {
    if (!favoriteTeams.length) return;
    
    console.log('🔔 Checking for favorite teams updates...');
    
    // Check if any favorite teams have live matches
    favoriteTeams.forEach(teamId => {
        checkTeamLiveUpdates(teamId);
    });
}

async function checkTeamLiveUpdates(teamId) {
    try {
        const today = getDate('today');
        const res = await fetch(`/api/team-schedule?team=${teamId}&date=${today}`);
        const data = await res.json();
        
        if (data.response && data.response.length > 0) {
            const liveMatches = data.response.filter(match => isLiveMatch(match));
            
            if (liveMatches.length > 0) {
                console.log(`🔴 Live updates found for team ${teamId}: ${liveMatches.length} live matches`);
                
                // Show notification for live matches
                showLiveNotification(liveMatches[0]);
                
                // Update UI if on favorites page
                if (currentPage === 'favorites') {
                    updateFavoriteTeamLiveStatus(teamId, liveMatches);
                }
            }
        }
    } catch (error) {
        console.error('Error checking team live Updates:', error);
    }
}

function showLiveNotification(match) {
    // Only show notification if not already shown
    const notificationKey = `live_${match.fixture.id}`;
    const alreadyNotified = localStorage.getItem(notificationKey);
    
    if (!alreadyNotified) {
        const homeTeam = match.teams?.home?.name || 'Unknown';
        const awayTeam = match.teams?.away?.name || 'Unknown';
        const minute = match.fixture?.status?.elapsed || 0;
        
        console.log(`🔔 Notification: ${homeTeam} vs ${awayTeam} is live (${minute}')`);
        
        // Store notification to prevent duplicates
        localStorage.setItem(notificationKey, 'true');
        
        // Clear notification after match ends
        setTimeout(() => {
            localStorage.removeItem(notificationKey);
        }, 300000); // 5 minutes
    }
}

function updateFavoriteTeamLiveStatus(teamId, liveMatches) {
    // Update favorite team cards with live status
    const favoriteCards = document.querySelectorAll('.favorite-match');
    
    favoriteCards.forEach(card => {
        const cardTeamId = card.dataset.teamId;
        if (cardTeamId === teamId) {
            const liveIndicator = card.querySelector('.live-indicator');
            if (liveIndicator) {
                if (liveMatches.length > 0) {
                    liveIndicator.classList.add('active');
                    liveIndicator.textContent = '🔴 LIVE';
                } else {
                    liveIndicator.classList.remove('active');
                    liveIndicator.textContent = '';
                }
            }
        }
    });
}

// Enhanced favorite management with live priority
function isFavorite(teamId) {
    return favoriteTeams.includes(teamId);
}

function toggleFavorite(teamId, teamName) {
    const index = favoriteTeams.indexOf(teamId);
    if (index > -1) {
        favoriteTeams.splice(index, 1);
        console.log(`💔 Removed ${teamName} from favorites`);
    } else {
        favoriteTeams.push(teamId);
        console.log(`⭐ Added ${teamName} to favorites`);
    }
    
    localStorage.setItem('favoriteTeams', JSON.stringify(favoriteTeams));
    
    // Start live update system if this is the first favorite
    if (favoriteTeams.length === 1) {
        startLiveUpdateSystem();
    }
}

// Global cache for fetched matches
let globalMatchesCache = null;
let currentFilter = 'elite'; // 'elite' or 'all'
let liveMatches = [];

let searchQuery = '';
let showLiveOnly = false;

// Debounced search handler
const debouncedSearch = debounce((query) => {
    searchQuery = query.toLowerCase().trim();
    console.log('🔍 Search triggered:', { searchQuery, showLiveOnly, currentFilter });
    
    // Get current matches from cache
    if (!globalMatchesCache) {
        console.log('❌ No global cache available');
        return;
    }
    
    let matches = globalMatchesCache.matches || [];
    console.log('📊 Total matches in cache:', matches.length);
    
    // Apply single source filtering
    displayMatches(matches, currentPage);
}, 250);

function handleSearch(query) {
    debouncedSearch(query);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    handleSearch('');
}

function toggleLiveFilter() {
    showLiveOnly = !showLiveOnly;
    const btn = document.getElementById('liveFilterBtn');
    
    console.log('🔴 Live filter toggled:', showLiveOnly);
    
    // Get live matches from global cache
    const allMatches = globalMatchesCache?.matches || [];
    const currentLiveMatches = allMatches.filter(match => isLiveMatch(match));
    console.log('📊 Current live matches count:', currentLiveMatches.length);
    
    if (showLiveOnly) {
        btn.classList.remove('hidden');
        btn.classList.add('active');
        btn.textContent = currentLanguage === 'ar' ? 'كل المباريات ⚡' : '⚡ All Matches';
        
        // Clear search when live filter is activated
        document.getElementById('searchInput').value = '';
        searchQuery = '';
        
        // Debug: Log live matches
        console.log('🔴 Live matches found:', currentLiveMatches.map(m => ({
            home: m.teams?.home?.name,
            away: m.teams?.away?.name,
            status: m.fixture?.status?.short,
            elapsed: m.fixture?.status?.elapsed
        })));
    } else {
        btn.classList.add('hidden');
        btn.classList.remove('active');
        btn.textContent = currentLanguage === 'ar' ? 'مباشر الآن ⚡' : '⚡ Live Now';
    }
    
    // Apply single source filtering
    if (globalMatchesCache) {
        displayMatches(globalMatchesCache.matches, currentPage);
    }
}

function toggleFilter() {
    currentFilter = currentFilter === 'elite' ? 'all' : 'elite';
    const btn = document.getElementById('toggleFilterBtn');
    
    // Reset live filter when elite filter is toggled
    showLiveOnly = false;
    const liveBtn = document.getElementById('liveFilterBtn');
    liveBtn.classList.add('hidden');
    liveBtn.classList.remove('active');
    liveBtn.textContent = currentLanguage === 'ar' ? 'مباشر الآن ⚡' : '⚡ Live Now';
    
    // Clear search when elite filter is toggled
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    
    // Save filter preference
    localStorage.setItem('matchlogic_filter', currentFilter);
    
    if (currentFilter === 'elite') {
        btn.classList.add('active');
        btn.textContent = currentLanguage === 'ar' ? 'أهم المباريات 🔥' : '🏆 Elite Only';
    } else {
        btn.classList.remove('active');
        btn.textContent = currentLanguage === 'ar' ? 'كل المباريات 🌍' : '🌍 Show All';
    }
    
    // Apply single source filtering
    if (globalMatchesCache) {
        displayMatches(globalMatchesCache.matches, currentPage);
    }
}

function changePage(page) {
    currentPage = page;
    setActiveTab(page);
    
    // RESET ALL FILTERS when switching pages
    showLiveOnly = false;
    searchQuery = '';
    currentFilter = localStorage.getItem('matchlogic_filter') || 'elite';
    
    // Reset UI elements
    document.getElementById('searchInput').value = '';
    const liveBtn = document.getElementById('liveFilterBtn');
    liveBtn.classList.add('hidden');
    liveBtn.classList.remove('active');
    liveBtn.textContent = currentLanguage === 'ar' ? 'مباشر الآن ⚡' : '⚡ Live Now';
    
    // Update elite filter button based on saved preference
    const eliteBtn = document.getElementById('toggleFilterBtn');
    if (currentFilter === 'elite') {
        eliteBtn.classList.add('active');
        eliteBtn.textContent = currentLanguage === 'ar' ? 'أهم المباريات 🔥' : '🏆 Elite Only';
    } else {
        eliteBtn.classList.remove('active');
        eliteBtn.textContent = currentLanguage === 'ar' ? 'كل المباريات 🌍' : '🌍 Show All';
    }
    
    if (page === "today") {
        loadMatches("today");
    } else if (page === "yesterday") {
        loadMatches("yesterday");
    } else if (page === "tomorrow") {
        loadMatches("tomorrow");
    } else if (page === "favorites") {
        loadFavoritesTodayMatches();

// Enhanced Favorites with Team History
async function showTeamDetails(teamId) {
    try {
        // Fetch team's upcoming and recent matches
        const res = await fetch(`/api/team/${teamId}/matches`);
        const data = await res.json();
        
        // Display team-specific view
        displayTeamMatches(data.response, teamId);
        
    } catch (err) {
        console.error('❌ Error loading team details:', err);
    }
}

function displayTeamMatches(matches, teamId) {
    const container = document.getElementById("matchesContainer");
    container.innerHTML = `<h2>Team Matches</h2>`;
    
    // Sort by date
    matches.sort((a, b) => new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0));
    
    matches.forEach(match => {
        // Create match card for team view
        const matchCard = createMatchCard(match, 'team');
        container.appendChild(matchCard);
    });
}

// Image Fallback Handler
function handleImageError(img) {
    if (!img.dataset.fallback) {
        img.dataset.fallback = 'true';
        // Use a clean, simple football crest SVG
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSIjMzMzIi8+CjxwYXRoIGQ9Ik0yMCA2QzEyLjI2OCA2IDYgMTIuMjY4IDYgMjBTMTIuMjY4IDM0IDIwIDM0UzM0IDI3LjczMiAzNCAyMFMyNy43MzIgNiAyMCA2Wk0yMCAzMEMxMy4zNzMgMzAgOCAyNC42MjcgOCAyMFMxMy4zNzMgMTAgMjAgMTBTMzIgMTUuMzczIDMyIDIwUzI2LjYyNyAzMCAyMCAzMFoiIGZpbGw9IiNmZmYiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iOCIgZmlsbD0iIzMzMyIvPgo8L3N2Zz4K';
        console.log('🖼️ Image fallback applied for:', img.alt);
    }
}

// Enhanced Favorites with Priority
function prioritizeFavoriteTeams(matches) {
    const favorites = getFavorites();
    const favoriteIds = favorites.map(f => f.id);
    
    // Sort: favorites first, then by priority
    return matches.sort((a, b) => {
        const aIsFavorite = favoriteIds.includes(a.teams?.home?.id) || favoriteIds.includes(a.teams?.away?.id);
        const bIsFavorite = favoriteIds.includes(b.teams?.home?.id) || favoriteIds.includes(b.teams?.away?.id);
        
        if (aIsFavorite && !bIsFavorite) return -1;
        if (!aIsFavorite && bIsFavorite) return 1;
        
        // Same favorite status: use existing priority logic
        return getMatchPriority(a.fixture?.status?.short) - getMatchPriority(b.fixture?.status?.short);
    });
}

// LocalStorage Favorites Management
const FAVORITES_KEY = "matchlogic_favorites";

function getFavorites() {
  const favorites = localStorage.getItem(FAVORITES_KEY);
  return favorites ? JSON.parse(favorites) : [];
}

function saveFavorites(favorites) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  console.log("💾 Favorites saved to localStorage:", favorites.length, "teams");
}

function addFavorite(teamId, teamName, teamLogo) {
  const favorites = getFavorites();
  const exists = favorites.find(f => f.id === teamId);
  
  if (!exists) {
    favorites.push({ id: teamId, name: teamName, logo: teamLogo });
    saveFavorites(favorites);
    console.log("⭐ Added to favorites:", teamName);
    return true;
  }
  
  return false;
}

function removeFavorite(teamId) {
  const favorites = getFavorites();
  const updatedFavorites = favorites.filter(f => f.id !== teamId);
  saveFavorites(updatedFavorites);
  console.log("🗑️ Removed from favorites:", teamId);
}

// Tab labels for dynamic language switching
const tabLabels = {
    ar: { today: 'اليوم', yesterday: 'الأمس', tomorrow: 'الغد', favorites: '⭐ المفضلة', settings: '⚙ الإعدادات' },
    en: { today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow', favorites: '⭐ Favorites', settings: '⚙ Settings' }
};

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
        redCards: "البطاقات الحمراء"
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
        redCards: "Red Cards"
    }
};

// Function to update tab titles based on language
function updateTabTitles() {
    document.getElementById('todayTab').textContent = tabLabels[currentLanguage].today;
    document.getElementById('yesterdayTab').textContent = tabLabels[currentLanguage].yesterday;
    document.getElementById('tomorrowTab').textContent = tabLabels[currentLanguage].tomorrow;
    document.getElementById('favoritesTab').textContent = tabLabels[currentLanguage].favorites;
    document.getElementById('settingsTab').textContent = tabLabels[currentLanguage].settings;
}

const FAVORITE_TEAMS_KEY = "matchlogic_favorite_teams";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for main page data
const cache = new Map();

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

function getFavoriteTeams() {
    try {
        const raw = localStorage.getItem(FAVORITE_TEAMS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Error reading favorites:", e);
        return [];
    }
}

function saveFavoriteTeams(teams) {
    try {
        localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(teams));
        console.log("💾 Favorites saved:", teams.length, "teams");
    } catch (e) {
        console.error("Error saving favorites:", e);
    }
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
    updateTabTitles(); // Initialize tab titles
    setActiveTab("today");
    changePage("today");
    registerPushAndSyncFavorites();
    
    // Start live refresh for today's page
    startLiveRefresh();
    
    // Initialize search and filter states
    const savedFilter = localStorage.getItem('matchlogic_filter') || 'elite';
    currentFilter = savedFilter;
    
    // Initialize search with proper RTL/placeholder
    updateButtonLabels();
    
    // Update UI based on saved filter
    if (currentFilter === 'all') {
        const btn = document.getElementById('toggleFilterBtn');
        btn.classList.remove('active');
        btn.textContent = currentLanguage === 'ar' ? 'كل المباريات 🌍' : '🌍 Show All';
    }
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
    
    // Use current date (removed forced testing date)
    const today = new Date();
    
    // Use UTC to avoid local midnight issues
    const utcDate = new Date(today.toISOString());
    
    if (type === "yesterday") {
        utcDate.setUTCDate(utcDate.getUTCDate() - 1);
    } else if (type === "tomorrow") {
        utcDate.setUTCDate(utcDate.getUTCDate() + 1);
    }
    
    // Return YYYY-MM-DD format in UTC
    const year = utcDate.getUTCFullYear();
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getUTCDate()).padStart(2, '0');
    
    const result = `${year}-${month}-${day}`;
    console.log(`📅 getDate(${type}): ${result} (UTC) - DYNAMIC DATE`);
    return result;
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
    
    // Clear UI immediately and show loader
    container.innerHTML = `<p class="loading">${translations[currentLanguage].loading}</p>`;
    
    const date = getDate(type);
    console.log(`📅 Loading matches for ${type} (${date})`);
    
    // Check date-partitioned cache first
    const cachedData = getCachedData(date);
    if (cachedData) {
        console.log(`📋 Using cached data for ${type} (${date})`);
        globalMatchesCache = { matches: cachedData, date: date, type: type };
        displayMatches(cachedData, type);
        return;
    }
    
    console.log(`📡 Fetching fresh data for ${type} (${date})`);
    
    try {
        const res = await fetch(`/api/matches?date=${date}`);
        console.log(`📡 API Response status: ${res.status}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`❌ Server error: ${res.status} - ${errorText}`);
            throw new Error(`Server error: ${res.status}`);
        }

        const data = await res.json();
        console.log(`📊 API Response data:`, data);
        
        // Cache the date-specific data
        cacheMatches(data.response, date);
        
        // Update global cache with date-specific data
        globalMatchesCache = { matches: data.response, date: date, type: type };
        
        displayMatches(data.response, type);

    } catch (err) {
        console.error(`❌ Load matches error:`, err);
        container.innerHTML = `<p class="error">${translations[currentLanguage].error}</p>`;
    }
}

function displayMatches(matches, pageType) {
    // EMERGENCY UI CLEAR - Force container clear at the beginning
    const container = document.getElementById("matchesContainer");
    if (container) {
        container.innerHTML = "";
    }
    
    displayMatchesInContainer(matches, container, pageType);
}

function displayMatchesInContainer(matches, container, pageType) {
    if (!container) return;
    
    // EMERGENCY UI CLEAR - Force container clear again
    container.innerHTML = "";
    pageType = pageType || "today";

    // Step A: Start with data for selected date
    let list = matches || [];
    console.log('📊 Step A - Starting with matches:', list.length, 'for page:', pageType);
    
    // Filter out null/invalid matches (quick check)
    list = list.filter(match => {
        const isValid = match && 
                       match.fixture && 
                       match.fixture.status && 
                       match.fixture.status.short;
        if (!isValid) {
            console.log('❌ Filtering out invalid match in display:', match);
        }
        return isValid;
    });
    
    console.log('📊 After null filter:', list.length);
    
    // GLOBAL PRO FILTER - Apply to all pages (except search exceptions)
    if (!searchQuery || !searchQuery.trim()) {
        const beforeProFilter = list.length;
        list = applyGlobalProFilter(list, searchQuery);
        console.log('🏆 Step A.5 - After Global Pro Filter:', list.length, 'from', beforeProFilter);
    }
    
    // Step B: Search filter (if search text exists)
    if (searchQuery && searchQuery.trim()) {
        const beforeSearch = list.length;
        list = list.filter(match => {
            const homeTeam = match.teams?.home?.name || '';
            const awayTeam = match.teams?.away?.name || '';
            const leagueName = match.league?.name || '';
            
            // Enhanced search with Arabic support
            const homeMatch = searchTeam(searchQuery, homeTeam);
            const awayMatch = searchTeam(searchQuery, awayTeam);
            const leagueMatch = searchTeam(searchQuery, leagueName);
            
            return homeMatch || awayMatch || leagueMatch;
        });
        console.log('📊 Step B - After search filter ("' + searchQuery + '"):', list.length, 'from', beforeSearch);
    }
    
    // Step C: Favorites filter (only on favorites page)
    if (pageType === "favorites") {
        const beforeFavorites = list.length;
        const favoriteTeams = getFavoriteTeams();
        const favoriteIds = favoriteTeams.map(t => t.id);
        
        list = list.filter(match => {
            const homeId = match.teams?.home?.id;
            const awayId = match.teams?.away?.id;
            return (homeId && favoriteIds.includes(homeId)) || (awayId && favoriteIds.includes(awayId));
        });
        console.log('⭐ Step C - After favorites filter:', list.length, 'from', beforeFavorites, 'favorite teams:', favoriteIds.length);
    }
    
    // Step D: Elite/Live filter (OPTIMIZED)
    if (showLiveOnly) {
        const beforeLive = list.length;
        // PERFORMANCE: Only check potentially live matches
        list = list.filter(match => {
            const statusShort = match.fixture?.status?.short;
            // Quick pre-filter for live candidates
            if (statusShort === 'NS' || statusShort === 'FT' || statusShort === 'AET' || 
                statusShort === 'PEN' || statusShort === 'PST') {
                return false;
            }
            // Only run full live check on candidates
            return isLiveMatch(match);
        });
        console.log('🔴 Step D - After live filter:', list.length, 'from', beforeLive);
        // BYPASS elite filter when live filter is active - show ALL live matches regardless of league
    } else if (currentFilter === 'elite') {
        // Step E: Elite filter (only if not showing live matches)
        const beforeElite = list.length;
        list = list.filter(match => {
            const leagueId = match.league?.id;
            return leagueId && Object.values(ELITE_LEAGUES).includes(leagueId);
        });
        console.log('📊 Step E - After elite filter:', list.length, 'from', beforeElite);
    }
    
    console.log('🎯 Final matches to display:', list.length);
    
    // Smart sorting for Today and Favorites pages
    if (pageType === "today" || pageType === "favorites") {
        list.sort((a, b) => {
            const statusA = a.fixture?.status?.short;
            const statusB = b.fixture?.status?.short;
            
            // Priority: Live/HT > Finished > Scheduled > Postponed
            const priorityA = getMatchPriority(statusA);
            const priorityB = getMatchPriority(statusB);
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // Same priority: sort by time
            return new Date(a.fixture?.date || 0) - new Date(b.fixture?.date || 0);
        });
    }
    
    if (pageType === "yesterday") {
        list = list.filter((m) => isFinishedOrPostponed(m.fixture?.status?.short));
        // Additional filter: Ensure no live matches appear in yesterday's view
        list = list.filter((m) => {
            const statusShort = m.fixture?.status?.short;
            return !statusShort || ["FT", "AET", "PEN", "PST"].includes(statusShort);
        });
    }
    
    if (!list.length) {
        // Use specific message for favorites page
        if (pageType === "favorites") {
            container.innerHTML = `<p class='favorites-empty'>${translations[currentLanguage].noFavoriteMatchesToday}</p>`;
        } else {
            container.innerHTML = `<p class='error'>${translations[currentLanguage].noResults}</p>`;
        }
        return;
    }

    // Render matches (OPTIMIZED - no background processes)
    list.forEach((match) => {
        const card = document.createElement("div");
        card.className = "match-card";
        const statusShort = match.fixture?.status?.short;

        let scoreHtml, statusText, statusClass;

        if (pageType === "yesterday") {
            scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
            statusText = statusShort === "PST" ? translations[currentLanguage].postponed : translations[currentLanguage].finished;
            statusClass = "status status-finished";
        } else if (pageType === "tomorrow") {
            scoreHtml = formatMatchTime(match.fixture?.date) || "—";
            statusText = statusShort === "PST" ? translations[currentLanguage].postponed : translations[currentLanguage].notStarted;
            statusClass = "status status-finished";
        } else { // Today's page or Favorites
            scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
            if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") {
                statusText = translations[currentLanguage].finished;
                statusClass = "status status-finished";
            } else if (statusShort === "PST") {
                statusText = translations[currentLanguage].postponed;
                statusClass = "status status-finished";
            } else if (statusShort === "NS") {
                statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                statusClass = "status status-finished";
            } else if (statusShort === "HT") {
                statusText = translations[currentLanguage].halfTime;
                statusClass = "status";
            } else if (statusShort && statusShort !== "NS" && statusShort !== "PST") {
                // Live match - show minute (OPTIMIZED - no extra checks)
                const minute = match.fixture?.status?.elapsed;
                statusText = minute ? `${translations[currentLanguage].live} ${minute}'` : translations[currentLanguage].live;
                statusClass = "status";
            } else {
                statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                statusClass = "status status-finished";
            }
        }

        card.innerHTML = `
            <div class="match-row">
                <div class="team">
                    <img src="${match.teams.home.logo}" alt="${match.teams.home.name} logo" onerror="handleImageError(this)" />
                    <span>${match.teams.home.name}</span>
                </div>
                <div class="score">
                    ${scoreHtml}
                    <div class="${statusClass}">${statusText}</div>
                </div>
                <div class="team">
                    <img src="${match.teams.away.logo}" alt="${match.teams.away.name} logo" onerror="handleImageError(this)" />
                    <span>${match.teams.away.name}</span>
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            window.location.href = `match.html?id=${match.fixture.id}`;
        });
        container.appendChild(card);
    });
    
    console.log('🎯 DOM rendered with', container.children.length, 'match cards');
}

function getMatchPriority(statusShort) {
    if (!statusShort) return 3; // Scheduled (NS)
    if (statusShort === "HT" || (statusShort !== "NS" && statusShort !== "PST" && statusShort !== "FT" && statusShort !== "AET" && statusShort !== "PEN")) {
        return 1; // Live/HT (highest priority)
    }
    if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") {
        return 2; // Finished
    }
    if (statusShort === "PST") {
        return 4; // Postponed (lowest priority)
    }
    return 3; // Scheduled (NS)
}

function changeLanguage() {
    currentLanguage = currentLanguage === "ar" ? "en" : "ar";
    localStorage.setItem("lang", currentLanguage);
    updateTabTitles();
    
    // Update button texts based on new language
    updateButtonLabels();
    
    // Re-render current page with new language
    changePage(currentPage);
}

function updateButtonLabels() {
    // Update search placeholder
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.placeholder = currentLanguage === 'ar' ? 'ابحث عن فريق أو دوري...' : 'Search teams...';
        searchInput.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    }
    
    // Update filter buttons
    const liveFilterBtn = document.getElementById('liveFilterBtn');
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    
    if (liveFilterBtn) {
        liveFilterBtn.textContent = showLiveOnly ? 
            (currentLanguage === 'ar' ? 'كل المباريات ⚡' : '⚡ All Matches') :
            (currentLanguage === 'ar' ? 'مباشر الآن ⚡' : '⚡ Live Now');
    }
    
    if (toggleFilterBtn) {
        toggleFilterBtn.textContent = currentFilter === 'elite' ? 
            (currentLanguage === 'ar' ? 'أهم المباريات 🔥' : '🏆 Elite Only') :
            (currentLanguage === 'ar' ? 'كل المباريات 🌍' : '🌍 Show All');
    }
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
                        <div class="favorite-team-item" data-id="${t.id}" onclick="openTeamScheduleModal('${t.name}', ${t.id})">
                            <img src="${t.logo}" alt="${t.name} logo" />
                            <span>${t.name}</span>
                            <button type="button" class="btn-remove" onclick="event.stopPropagation(); removeFromFavorites(${t.id})" aria-label="${translations[currentLanguage].remove}">${translations[currentLanguage].remove}</button>
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
                                    <img src="${team.logo}" alt="${team.name} logo" />
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
    
    const cacheKey = `favorites-today-${getDate("today")}`;
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
        const allMatches = cachedData.response || [];
        const filtered = allMatches.filter(m => {
            const homeId = m.teams?.home?.id;
            const awayId = m.teams?.away?.id;
            return (homeId && favIds.includes(homeId)) || (awayId && favIds.includes(awayId));
        });
        if (filtered.length === 0) {
            container.innerHTML = `<p class="favorites-empty">${translations[currentLanguage].noFavoriteMatchesToday}</p>`;
        } else {
            // Use createFavoriteMatchCard for team schedule deep-dive
            container.innerHTML = '';
            filtered.forEach(match => {
                const card = createFavoriteMatchCard(match);
                
                const statusShort = match.fixture?.status?.short;
                const dateInPast = isMatchDateInPast(match);

                let scoreHtml, statusText, statusClass;

                // Today's page logic for favorites
                scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
                if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") {
                    statusText = translations[currentLanguage].finished;
                    statusClass = "status status-finished";
                } else if (statusShort === "PST") {
                    statusText = translations[currentLanguage].postponed;
                    statusClass = "status status-finished";
                } else if (statusShort === "NS") {
                    statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                    statusClass = "status status-finished";
                } else if (statusShort === "HT") {
                    statusText = translations[currentLanguage].halfTime;
                    statusClass = "status";
                } else if (statusShort && statusShort !== "NS" && statusShort !== "PST") {
                    // Live match - show minute
                    const minute = match.fixture?.status?.elapsed;
                    statusText = minute ? `${translations[currentLanguage].live} ${minute}'` : translations[currentLanguage].live;
                    statusClass = "status";
                } else {
                    statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                    statusClass = "status status-finished";
                }

                card.innerHTML = `
                    <div class="match-row">
                        <div class="team">
                            <img src="${match.teams.home.logo}" alt="${match.teams.home.name} logo" onerror="handleImageError(this)" />
                            <span>${match.teams.home.name}</span>
                        </div>
                        <div class="score">
                            ${scoreHtml}
                            <div class="${statusClass}">${statusText}</div>
                        </div>
                        <div class="team">
                            <img src="${match.teams.away.logo}" alt="${match.teams.away.name} logo" onerror="handleImageError(this)" />
                            <span>${match.teams.away.name}</span>
                        </div>
                    </div>
                `;
                
                container.appendChild(card);
            });
        }
        return;
    }
    
    try {
        const res = await fetch(`/api/matches?date=${getDate("today")}`);
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        setCachedData(cacheKey, data);
        
        const allMatches = data.response || [];
        const filtered = allMatches.filter(m => {
            const homeId = m.teams?.home?.id;
            const awayId = m.teams?.away?.id;
            return (homeId && favIds.includes(homeId)) || (awayId && favIds.includes(awayId));
        });
        if (filtered.length === 0) {
            container.innerHTML = `<p class="favorites-empty">${translations[currentLanguage].noFavoriteMatchesToday}</p>`;
        } else {
            // Use createFavoriteMatchCard for team schedule deep-dive
            container.innerHTML = '';
            filtered.forEach(match => {
                const card = createFavoriteMatchCard(match);
                
                const statusShort = match.fixture?.status?.short;
                const dateInPast = isMatchDateInPast(match);

                let scoreHtml, statusText, statusClass;

                // Today's page logic for favorites
                scoreHtml = `${match.goals?.home ?? "-"} - ${match.goals?.away ?? "-"}`;
                if (statusShort === "FT" || statusShort === "AET" || statusShort === "PEN") {
                    statusText = translations[currentLanguage].finished;
                    statusClass = "status status-finished";
                } else if (statusShort === "PST") {
                    statusText = translations[currentLanguage].postponed;
                    statusClass = "status status-finished";
                } else if (statusShort === "NS") {
                    statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                    statusClass = "status status-finished";
                } else if (statusShort === "HT") {
                    statusText = translations[currentLanguage].halfTime;
                    statusClass = "status";
                } else if (statusShort && statusShort !== "NS" && statusShort !== "PST") {
                    // Live match - show minute
                    const minute = match.fixture?.status?.elapsed;
                    statusText = minute ? `${translations[currentLanguage].live} ${minute}'` : translations[currentLanguage].live;
                    statusClass = "status";
                } else {
                    statusText = formatMatchTime(match.fixture?.date) || translations[currentLanguage].notStarted;
                    statusClass = "status status-finished";
                }

                card.innerHTML = `
                    <div class="match-row">
                        <div class="team">
                            <img src="${match.teams.home.logo}" alt="${match.teams.home.name} logo" onerror="handleImageError(this)" />
                            <span>${match.teams.home.name}</span>
                        </div>
                        <div class="score">
                            ${scoreHtml}
                            <div class="${statusClass}">${statusText}</div>
                        </div>
                        <div class="team">
                            <img src="${match.teams.away.logo}" alt="${match.teams.away.name} logo" onerror="handleImageError(this)" />
                            <span>${match.teams.away.name}</span>
                        </div>
                    </div>
                `;
                
                container.appendChild(card);
            });
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
