require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');
const maintenanceMode = require('./maintenance');

const app = express();
const PORT = process.env.PORT || 3001;

// MAINTENANCE MODE - ENABLED
app.use(maintenanceMode);

// المفتاح يُقرأ حصرياً من البيئة ولا يُطبع أبداً في الـ log
if (!process.env.FOOTBALL_API_KEY) {
  console.error("❌ FOOTBALL_API_KEY غير موجود في ملف .env");
  process.exit(1);
}

// Cache configuration for RapidAPI - Optimized durations
const myCache = new NodeCache({ 
  stdTTL: 600, // 10 minutes for general cache (increased from 5)
  checkperiod: 60 // Check for expired keys every minute
});

// Smart Team Cache for 7 days
const teamCache = new NodeCache({ stdTTL: 7 * 24 * 60 * 60 }); // 7 days in seconds

// VAPID للإشعارات (اختياري: إذا لم يُضف في .env يُولّد تلقائياً للتطوير فقط)
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
if (!vapidPublicKey || !vapidPrivateKey) {
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
}
webpush.setVapidDetails(
  'mailto:matchlogic@localhost',
  vapidPublicKey,
  vapidPrivateKey
);

// المشتركون في الإشعارات: { subscription, favoriteTeamIds }[]
const pushSubscribers = [];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for RapidAPI - 8-Requests Per Minute Rule
const apiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 8, // 8 requests per minute (API requirement)
    message: 'API rate limit exceeded. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for stress tests
    skip: (req) => {
        return req.headers['x-stress-test'] === 'true';
    }
});

app.use('/api/', apiRateLimit);

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.FOOTBALL_API_KEY; // Restore environment variable

async function fetchFromAPI(endpoint, params = {}, useCache = true, priority = 'normal') {
  const cacheKey = endpoint + JSON.stringify(params);
  if (useCache) {
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      console.log("⚡ من الكاش:", endpoint);
      return cachedData;
    }
  }

  try {
    if (useCache) console.log("🌍 طلب جديد:", endpoint);

    const response = await axios.get(
      `${BASE_URL}/${endpoint}`,
      {
        params,
        headers: {
          'x-apisports-key': API_KEY, // API key
          'User-Agent': 'MatchLogic/1.0', // Clean user agent
          'Accept': 'application/json', // Explicit accept header
          'Accept-Encoding': 'gzip, deflate' // Compression support
        }
      }
    );

    if (useCache) myCache.set(cacheKey, response.data);
    return response.data;

  } catch (error) {
    console.error("❌ API Error:", error.message);
    return {};
  }
}

async function fetchTeamDetails(teamId) {
  const cacheKey = `team-${teamId}`;
  
  // Check team cache first (7 days TTL)
  let teamData = teamCache.get(cacheKey);
  if (teamData) {
    console.log("⚡ Team from cache:", teamId);
    return teamData;
  }

  try {
    console.log("🌍 Fetching team details:", teamId);
    const response = await axios.get(
      `${BASE_URL}/teams?id=${teamId}`,
      {
        headers: {
          'x-apisports-key': process.env.FOOTBALL_API_KEY
        }
      }
    );

    teamData = response.data.response?.[0] || {};
    if (teamData) {
      // Cache team data for 7 days
      teamCache.set(cacheKey, teamData);
      console.log("✅ Team cached:", teamId);
    }
    
    return teamData;
  } catch (error) {
    console.error("❌ Team API Error:", error.message);
    return {};
  }
}

////////////////////////////////////////////////////
// 📅 مباريات حسب التاريخ
////////////////////////////////////////////////////
app.get('/api/matches', async (req, res) => {
  try {
    let { date } = req.query;
    
    // If no date provided, use today's date
    if (!date) {
      const today = new Date().toISOString().split('T')[0];
      date = today;
      console.log(`📅 No date provided, using today: ${date}`);
    }

    console.log(`📅 Fetching all matches for date: ${date}`);
    
    // Restore simple date parameter for global coverage
    const data = await fetchFromAPI('fixtures', { date });
    
    console.log(`📊 API Response:`, data);
    res.json(data);

  } catch (error) {
    console.error('❌ Error in /api/matches:', error.message);
    res.status(500).json({ error: "خطأ في جلب المباريات" });
  }
});

// Test endpoint to check API key validity
app.get('/api/test-key', async (req, res) => {
  try {
    console.log(`🔑 Testing RapidAPI key`);
    
    // Test with a simple endpoint that should work
    const data = await fetchFromAPI('countries', {});
    console.log(`🔑 Countries API Response:`, data);
    res.json({ 
      apiKeyValid: true, 
      countriesCount: data.response?.length || 0,
      sampleData: data.response?.slice(0, 3) || []
    });

  } catch (error) {
    console.error('❌ API key test error:', error.message);
    res.status(500).json({ 
      apiKeyValid: false, 
      error: error.message 
    });
  }
});

// Test endpoint to fetch all matches without filters
app.get('/api/matches-test', async (req, res) => {
  try {
    console.log(`🧪 Testing RapidAPI without filters`);
    
    // Try minimal parameters
    const data = await fetchFromAPI('fixtures', {});
    console.log(`🧪 Test API Response:`, data);
    res.json(data);

  } catch (error) {
    console.error('❌ Error in /api/matches-test:', error.message);
    res.status(500).json({ error: "Test error" });
  }
});

////////////////////////////////////////////////////
// ⚽ أحداث
////////////////////////////////////////////////////
app.get('/api/match/events/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/events', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب الأحداث" });
  }
});

////////////////////////////////////////////////////
// 📋 التشكيلة
////////////////////////////////////////////////////
app.get('/api/match/lineups/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/lineups', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب التشكيلة" });
  }
});

////////////////////////////////////////////////////
// 📊 الإحصائيات
////////////////////////////////////////////////////
app.get('/api/match/statistics/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/statistics', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

////////////////////////////////////////////////////
// 🔍 بحث الفرق (للمفضلة)
////////////////////////////////////////////////////
app.get('/api/teams/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 3) {
      return res.json({ response: [] });
    }
    
    // Arabic to English team name mapping
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
      'ليدز يونايتد': 'Leeds United',
      'وست هام يونايتد': 'West Ham United',
      'أستون فيلا': 'Aston Villa',
      'نيوكاسل يونايتد': 'Newcastle United',
      'ولفرهامبتون': 'Wolverhampton',
      'نوتنغهام فورست': 'Nottingham Forest',
      'ساوثهامبتون': 'Southampton',
      'ليستر سيتي': 'Leicester City',
      'بورنموث': 'Bournemouth',
      
      // La Liga
      'ريال مدريد': 'Real Madrid',
      'برشلونة': 'Barcelona',
      'أتلتيكو مدريد': 'Atletico Madrid',
      'إشبيلية': 'Sevilla',
      'ريال سوسيداد': 'Real Sociedad',
      'فياريال': 'Villarreal',
      'ريال بيتيس': 'Real Betis',
      'أتلتيك بلباو': 'Athletic Bilbao',
      'فالنسيا': 'Valencia',
      'سيلتا فيغو': 'Celta Vigo',
      
      // Serie A
      'يوفنتوس': 'Juventus',
      'إنتر ميلان': 'Inter',
      'ميلان': 'Milan',
      'نابولي': 'Napoli',
      'روما': 'Roma',
      'لاسيو': 'Lazio',
      'فيورنتينا': 'Fiorentina',
      'أتالانتا': 'Atalanta',
      
      // Bundesliga
      'بايرن ميونخ': 'Bayern Munich',
      'بوروسيا دورتموند': 'Borussia Dortmund',
      'لايبزيغ': 'RB Leipzig',
      'باير ليفركوزن': 'Bayer Leverkusen',
      'أينتراخت فرانكفورت': 'Eintracht Frankfurt',
      
      // Ligue 1
      'باريس سان جيرمان': 'Paris Saint Germain',
      'أولمبيك مارسيليا': 'Marseille',
      'أولمبيك ليون': 'Lyon',
      'موناكو': 'Monaco',
      'ليل': 'Lille',
      
      // Egyptian League
      'الأهلي': 'Al Ahly',
      'الزمالك': 'Zamalek',
      'بيراميدز': 'Pyramids',
      'إنبي': 'ENPPI',
      'سموحة': 'Smouha',
      'طلائع الجيش': 'Al Talaei El Gaish',
      'المقاولون العرب': 'Al Mokawloon Al Arab',
      'سيراميكا كليوباترا': 'Ceramica Cleopatra',
      'الاتحاد السكندري': 'Al Ittihad Alexandria',
      'غزل المحلة': 'Ghazl El Mahalla',
      
      // Saudi League
      'الهلال': 'Al Hilal',
      'النصر': 'Al Nassr',
      'الاتحاد': 'Al Ittihad',
      'الأهلي السعودي': 'Al Ahli Saudi',
      'الشباب': 'Al Shabab',
      'التعاون': 'Al Taawoun',
      'الفيحاء': 'Al Fayha',
      'الرائد': 'Al Raed',
      'الفتح': 'Al Fateh',
      'الوحده': 'Al Wehda',
      'الطائي': 'Al Taee',
      'الجبلين': 'Al Jabalain',
      'الخليج': 'Al Khaleej',
      'حطين': 'Hattin',
      'الرجاء': 'Al-Rajaa',
      'الدرعيه': 'Al-Duhail'
    };
    
    // Check if query is Arabic and map to English
    let searchQuery = q;
    if (ARABIC_TEAM_MAPPING[q]) {
      searchQuery = ARABIC_TEAM_MAPPING[q];
    }
    
    const data = await fetchFromAPI('teams', { search: searchQuery });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "خطأ في البحث عن الفرق" });
  }
});

////////////////////////////////////////////////////
// � جدول الفريق (Team Schedule)
////////////////////////////////////////////////////
app.get('/api/team-schedule', async (req, res) => {
  try {
    const { team, from, to, date } = req.query;
    
    if (!team) {
      return res.status(400).json({ error: "Team ID is required" });
    }
    
    console.log(`📅 Team schedule request for team ${team}, params:`, { from, to, date });
    
    let data = { response: [] };
    
    // Try multiple approaches to get team matches
    try {
      // Approach 1: Season 2025 (most reliable for current leagues)
      console.log(`🔍 Trying season 2025 for team ${team}`);
      const season2025Params = { team, season: 2025 };
      const fullUrl2025 = `${BASE_URL}/fixtures?${new URLSearchParams(season2025Params).toString()}`;
      console.log(`🌐 Full URL: ${fullUrl2025}`);
      data = await fetchFromAPI('fixtures', season2025Params);
      console.log(`📊 Season 2025 result: ${data.response?.length || 0} matches`);
      
      // If no matches found, try Approach 2: Next 10 matches
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Trying next 10 matches approach`);
        const next10Params = { team, next: 10 };
        const fullUrlNext10 = `${BASE_URL}/fixtures?${new URLSearchParams(next10Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrlNext10}`);
        data = await fetchFromAPI('fixtures', next10Params);
        console.log(`📊 Next 10 result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 3: Date range
      if (!data.response || data.response.length === 0) {
        if (date) {
          console.log(`🔍 Trying specific date: ${date}`);
          const dateParams = { team, date };
          const fullUrlDate = `${BASE_URL}/fixtures?${new URLSearchParams(dateParams).toString()}`;
          console.log(`🌐 Full URL: ${fullUrlDate}`);
          data = await fetchFromAPI('fixtures', dateParams);
        } else if (from && to) {
          console.log(`🔍 Trying date range: ${from} to ${to}`);
          const rangeParams = { team, from, to };
          const fullUrlRange = `${BASE_URL}/fixtures?${new URLSearchParams(rangeParams).toString()}`;
          console.log(`🌐 Full URL: ${fullUrlRange}`);
          data = await fetchFromAPI('fixtures', rangeParams);
        }
        console.log(`📊 Date range result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 4: 2026 season
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Trying 2026 season`);
        const season2026Params = { team, season: 2026 };
        const fullUrl2026 = `${BASE_URL}/fixtures?${new URLSearchParams(season2026Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrl2026}`);
        data = await fetchFromAPI('fixtures', season2026Params);
        console.log(`📊 2026 season result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 5: Last 15 matches
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Trying last 15 matches`);
        const last15Params = { team, last: 15 };
        const fullUrlLast15 = `${BASE_URL}/fixtures?${new URLSearchParams(last15Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrlLast15}`);
        data = await fetchFromAPI('fixtures', last15Params);
        console.log(`📊 Last 15 result: ${data.response?.length || 0} matches`);
      }
      
    } catch (apiError) {
      console.error(`❌ API Error in team schedule:`, apiError.message);
      if (apiError.response) {
        console.error(`❌ API Response Status:`, apiError.response.status);
        console.error(`❌ API Response Data:`, apiError.response.data);
      }
    }
    
    console.log(`🎯 Final result: ${data.response?.length || 0} matches for team ${team}`);
    
    // Log sample match data if found
    if (data.response && data.response.length > 0) {
      console.log(`📋 Sample match:`, {
        date: data.response[0].fixture?.date,
        teams: `${data.response[0].teams?.home?.name} vs ${data.response[0].teams?.away?.name}`,
        league: data.response[0].league?.name,
        season: data.response[0].league?.season
      });
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('❌ Error in /api/team-schedule:', error.message);
    res.status(500).json({ error: "خطأ في جلب جدول الفريق" });
  }
});

////////////////////////////////////////////////////
// �🔔 Push: مفتاح VAPID العام + تسجيل الاشتراك
////////////////////////////////////////////////////
app.get('/api/push/vapid-public', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  try {
    const { subscription, favoriteTeamIds } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription required" });
    }
    const teamIds = Array.isArray(favoriteTeamIds) ? favoriteTeamIds : [];
    const existing = pushSubscribers.findIndex(
      (s) => s.subscription.endpoint === subscription.endpoint
    );
    const record = { subscription, favoriteTeamIds: teamIds };
    if (existing >= 0) pushSubscribers[existing] = record;
    else pushSubscribers.push(record);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "خطأ في تسجيل الاشتراك" });
  }
});

////////////////////////////////////////////////////
// 🔄 Cron Job Trigger
////////////////////////////////////////////////////
app.get('/api/cron-notify', async (req, res) => {
  try {
    await runNotificationsJob();
    res.json({ ok: true, message: 'Notifications job executed' });
  } catch (error) {
    console.error('Error in cron-notify:', error);
    res.status(500).json({ error: 'Failed to execute notifications job' });
  }
});

////////////////////////////////////////////////////
// 🔄 Background Job: أهداف + تشكيلات للفرق المفضلة فقط
////////////////////////////////////////////////////
const fixtureState = new Map(); // fixtureId -> { homeGoals, awayGoals, lineupNotified, homeTeamId, awayTeamId, homeName, awayName }

async function sendPushToTeamSubscribers(teamId, payload) {
  const payloadStr = JSON.stringify(payload);
  for (const { subscription, favoriteTeamIds } of pushSubscribers) {
    if (!favoriteTeamIds || !favoriteTeamIds.includes(teamId)) continue;
    try {
      await webpush.sendNotification(subscription, payloadStr);
    } catch (err) {
      console.error("خطأ إرسال push:", err.message);
    }
  }
}

async function runNotificationsJob() {
  if (pushSubscribers.length === 0) return;
  const allFavoriteIds = new Set();
  pushSubscribers.forEach((s) => (s.favoriteTeamIds || []).forEach((id) => allFavoriteIds.add(id)));
  if (allFavoriteIds.size === 0) return;
  const today = new Date().toISOString().split('T')[0];
  let data;
  try {
    data = await fetchFromAPI('fixtures', { date: today }, false);
  } catch {
    return;
  }
  const fixtures = (data.response || []).filter(
    (f) => allFavoriteIds.has(f.teams?.home?.id) || allFavoriteIds.has(f.teams?.away?.id)
  );
  for (const f of fixtures) {
    const fixtureId = f.fixture?.id;
    const home = f.teams?.home || {};
    const away = f.teams?.away || {};
    const homeId = home.id;
    const awayId = away.id;
    const homeName = home.name || 'الفريق';
    const awayName = away.name || 'الفريق';
    if (!fixtureId) continue;

    let state = fixtureState.get(fixtureId);
    if (!state) {
      state = { homeGoals: 0, awayGoals: 0, lineupNotified: false, homeTeamId: homeId, awayTeamId: awayId, homeName, awayName };
      fixtureState.set(fixtureId, state);
    }

    // أحداث (أهداف)
    try {
      const eventsData = await fetchFromAPI('fixtures/events', { fixture: fixtureId }, false);
      const events = eventsData.response || [];
      const goalsHome = events.filter((e) => e.team?.id === homeId && (e.type === 'Goal' || e.detail?.includes('Goal'))).length;
      const goalsAway = events.filter((e) => e.team?.id === awayId && (e.type === 'Goal' || e.detail?.includes('Goal'))).length;
      if (goalsHome > state.homeGoals) {
        state.homeGoals = goalsHome;
        await sendPushToTeamSubscribers(homeId, {
          title: '⚽ هدف!',
          body: `${homeName} أحرز هدفاً`,
          data: { url: `/match.html?id=${fixtureId}` }
        });
      }
      if (goalsAway > state.awayGoals) {
        state.awayGoals = goalsAway;
        await sendPushToTeamSubscribers(awayId, {
          title: '⚽ هدف!',
          body: `${awayName} أحرز هدفاً`,
          data: { url: `/match.html?id=${fixtureId}` }
        });
      }
    } catch (_) {}

    // تشكيلة
    if (!state.lineupNotified) {
      try {
        const lineupsData = await fetchFromAPI('fixtures/lineups', { fixture: fixtureId }, false);
        const lineups = lineupsData.response || [];
        if (lineups.length > 0) {
          state.lineupNotified = true;
          for (const lu of lineups) {
            const team = lu.team || {};
            const tid = team.id;
            const tname = team.name || 'الفريق';
            await sendPushToTeamSubscribers(tid, {
              title: '📋 التشكيلة الرسمية',
              body: `التشكيلة الرسمية لـ ${tname} أصبحت متاحة الآن`,
              data: { url: `/match.html?id=${fixtureId}` }
            });
          }
        }
      } catch (_) {}
    }
  }
}

const NOTIFY_INTERVAL_MS = 2 * 60 * 1000;
setInterval(runNotificationsJob, NOTIFY_INTERVAL_MS);
setTimeout(runNotificationsJob, 5000);

// For Vercel deployment, export the app
// For local development, listen on port
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر شاغل على: http://localhost:${PORT}`);
    console.log(`🌐 Network interfaces:`);
    console.log(`   - http://localhost:${PORT} (localhost)`);
    console.log(`   - http://127.0.0.1:${PORT} (IPv4)`);
    console.log(`   - http://0.0.0.0:${PORT} (All interfaces)`);
  });
}

// Export for Vercel
module.exports = app;
