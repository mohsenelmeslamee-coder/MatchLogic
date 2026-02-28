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

// MAINTENANCE MODE - Uncomment to enable
// app.use(maintenanceMode);

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
    const response = await fetchFromAPI('teams', { id: teamId }, false);
    teamData = response.data.response?.[0] || {};
    if (teamData) {
      // Cache team data for 7 days
      teamCache.set(cacheKey, teamData);
      console.log("✅ Team cached:", teamId);
    }
    return teamData;
  } catch (error) {
    console.error("❌ Team fetch error:", error.message);
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
// 📊 إحصائيات المباراة
////////////////////////////////////////////////////
app.get('/api/match/events/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/events', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب الأحداث" });
  }
});

app.get('/api/match/lineups/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/lineups', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب التشكيلة" });
  }
});

app.get('/api/match/statistics/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/statistics', { fixture: req.params.id }, true);
    res.json(data);
  } catch {
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

////////////////////////////////////////////////////
// 🔍 بحث الفرق
////////////////////////////////////////////////////
app.get('/api/teams/search', async (req, res) => {
  try {
    let { q } = req.query;
    
    // Arabic team name mapping
    const ARABIC_TEAM_MAPPING = {
      'الريال': 'Real Madrid',
      'برشلونة': 'Barcelona',
      'مانشستر': 'Manchester',
      'ليفربول': 'Liverpool',
      'بايرن': 'Bayern Munich',
      'سيتي': 'Manchester City',
      'تشيلسي': 'Chelsea',
      'أرسنال': 'Arsenal',
      'يوفنتوس': 'Juventus',
      'ميلان': 'AC Milan',
      'إنتر': 'Inter Milan',
      'نابولي': 'Napoli',
      'روما': 'Roma',
      'دورتموند': 'Borussia Dortmund',
      'شالكة': 'Schalke 04',
      'باير ليفركوزن': 'Bayer Leverkusen',
      'ليون': 'Lyon',
      'مرسيليا': 'Marseille',
      'باريس': 'Paris Saint-Germain',
      'أياكس': 'Ajax',
      'بنفيكا': 'Benfica',
      'بورتو': 'Porto',
      'سبورتينج': 'Sporting CP',
      'غالatasراي': 'Galatasaray',
      'فنربخشة': 'Fenerbahçe',
      'باشاكشهير': 'Basaksehir',
      'زينت': 'Zenit',
      'سبارتاك': 'Spartak Moscow',
      'لوكوموتيف': 'Lokomotiv Moscow',
      'سيسكا': 'CSKA Moscow',
      'دينامو': 'Dynamo Kyiv',
      'شاختار': 'Shakhtar Donetsk',
      'أندرلخت': 'Anderlecht',
      'كلوب بروج': 'Club Brugge',
      'ستاندارد': 'Standard Liège',
      'سيلتيك': 'Celtic',
      'رينجرز': 'Rangers',
      'فالنسيا': 'Valencia',
      'أتلتيكو': 'Atletico Madrid',
      'سيvilla': 'Sevilla',
      'ريال بيتيس': 'Real Betis',
      'فياريال': 'Villarreal',
      'ريال سوسيداد': 'Real Sociedad',
      'أتلتيك بلباو': 'Athletic Bilbao',
      'خيتافي': 'Getafe',
      'إسبانيول': 'Espanyol',
      'ريال مايوركا': 'Mallorca',
      'أوساسونا': 'Osasuna',
      'رايو فاليكانو': 'Rayo Vallecano',
      'ألميريا': 'Almeria',
      'قرطبة': 'Cordoba',
      'غرناطة': 'Granada',
      'لاس بالماس': 'Las Palmas',
      'إلباس': 'Elche',
      'مايوركا': 'Mallorca'
    };
    
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
// 📈 مباريات الفريق
////////////////////////////////////////////////////
app.get('/api/team/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to, season } = req.query;
    
    let data;
    
    // Approach 1: Try season-based approach first
    if (season) {
      const seasonParams = { team: id, season: parseInt(season) };
      const fullUrl = `${BASE_URL}/fixtures?${new URLSearchParams(seasonParams).toString()}`;
      console.log(`🌐 Full URL: ${fullUrl}`);
      data = await fetchFromAPI('fixtures', seasonParams);
      console.log(`📊 Season ${season} result: ${data.response?.length || 0} matches`);
      
      // If no matches found, try Approach 2: Next 10 matches
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 No season matches, trying next 10...`);
        const next10Params = { team: id, next: 10 };
        const fullUrlNext10 = `${BASE_URL}/fixtures?${new URLSearchParams(next10Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrlNext10}`);
        data = await fetchFromAPI('fixtures', next10Params);
        console.log(`📊 Next 10 result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 3: Date range
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Still no matches, trying date range...`);
        if (from && to) {
          console.log(`🔍 Trying date range: ${from} to ${to}`);
          const rangeParams = { team: id, from, to };
          const fullUrlRange = `${BASE_URL}/fixtures?${new URLSearchParams(rangeParams).toString()}`;
          console.log(`🌐 Full URL: ${fullUrlRange}`);
          data = await fetchFromAPI('fixtures', rangeParams);
        }
        console.log(`📊 Date range result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 4: Current season
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Trying current season 2026...`);
        const season2026Params = { team: id, season: 2026 };
        const fullUrl2026 = `${BASE_URL}/fixtures?${new URLSearchParams(season2026Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrl2026}`);
        data = await fetchFromAPI('fixtures', season2026Params);
        console.log(`📊 2026 season result: ${data.response?.length || 0} matches`);
      }
      
      // If still no matches, try Approach 5: Last 15 matches
      if (!data.response || data.response.length === 0) {
        console.log(`🔍 Trying last 15 matches...`);
        const last15Params = { team: id, last: 15 };
        const fullUrlLast15 = `${BASE_URL}/fixtures?${new URLSearchParams(last15Params).toString()}`;
        console.log(`🌐 Full URL: ${fullUrlLast15}`);
        data = await fetchFromAPI('fixtures', last15Params);
        console.log(`📊 Last 15 result: ${data.response?.length || 0} matches`);
      }
      
    } else {
      // Default: Next 10 matches
      data = await fetchFromAPI('fixtures', { team: id, next: 10 });
    }
    
    res.json(data);
  } catch (error) {
    console.error('❌ Error in /api/team/:id/matches:', error.message);
    res.status(500).json({ error: "خطأ في جلب مباريات الفريق" });
  }
});

////////////////////////////////////////////////////
// 🔔 إشعارات Web Push
////////////////////////////////////////////////////
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { subscription, favoriteTeamIds } = req.body;
    
    // Remove existing subscription for this endpoint
    pushSubscribers.splice(0, pushSubscribers.length, 
      ...pushSubscribers.filter(sub => sub.subscription.endpoint !== subscription.endpoint)
    );
    
    // Add new subscription
    pushSubscribers.push({ subscription, favoriteTeamIds });
    
    console.log(`🔔 New subscriber: ${subscription.endpoint.substring(0, 50)}...`);
    console.log(`🔔 Favorite teams: ${favoriteTeamIds.join(', ')}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Push subscription error:', error.message);
    res.status(500).json({ error: "خطأ في الاشتراك بالإشعارات" });
  }
});

app.get('/api/push/vapid-public', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

// Send push notifications for live matches
async function sendPushNotifications() {
  const today = new Date().toISOString().split('T')[0];
  let data;
  try {
    data = await fetchFromAPI('fixtures', { date: today }, false);
  } catch {
    return;
  }
  
  const matches = data.response || [];
  const liveMatches = matches.filter(m => {
    const status = m.fixture?.status?.short;
    return status && status !== 'NS' && status !== 'FT' && status !== 'AET' && status !== 'PEN' && status !== 'PST';
  });
  
  for (const subscriber of pushSubscribers) {
    const relevantMatches = liveMatches.filter(m => {
      const homeId = m.teams?.home?.id;
      const awayId = m.teams?.away?.id;
      return (homeId && subscriber.favoriteTeamIds.includes(homeId)) || 
             (awayId && subscriber.favoriteTeamIds.includes(awayId));
    });
    
    if (relevantMatches.length > 0) {
      try {
        await webpush.sendNotification(
          subscriber.subscription,
          JSON.stringify({
            title: '🔔 MatchLogic Live Update',
            body: `${relevantMatches.length} live match(es) involving your favorite teams!`,
            icon: '/icon-192x192.png',
            data: { matches: relevantMatches }
          })
        );
        console.log(`📤 Push notification sent to ${subscriber.subscription.endpoint.substring(0, 50)}...`);
      } catch (pushError) {
        console.error('❌ Push notification error:', pushError.message);
      }
    }
  }
}

// Push notification interval (every 2 minutes for live matches)
setInterval(sendPushNotifications, 2 * 60 * 1000);

// Enhanced push notification with match events
async function sendMatchEventNotifications() {
  const today = new Date().toISOString().split('T')[0];
  let data;
  try {
    data = await fetchFromAPI('fixtures', { date: today }, false);
  } catch {
    return;
  }
  
  const matches = data.response || [];
  
  for (const match of matches) {
    const fixtureId = match.fixture?.id;
    const homeId = match.teams?.home?.id;
    const awayId = match.teams?.away?.id;
    
    // أحداث (أهداف)
    try {
      const eventsData = await fetchFromAPI('fixtures/events', { fixture: fixtureId }, false);
      const events = eventsData.response || [];
      const goalsHome = events.filter((e) => e.team?.id === homeId && (e.type === 'Goal' || e.detail?.includes('Goal'))).length;
      const goalsAway = events.filter((e) => e.team?.id === awayId && (e.type === 'Goal' || e.detail?.includes('Goal'))).length;
      
      // Check if this is a new goal (simplified logic)
      if (goalsHome > 0 || goalsAway > 0) {
        for (const subscriber of pushSubscribers) {
          if (subscriber.favoriteTeamIds.includes(homeId) || subscriber.favoriteTeamIds.includes(awayId)) {
            try {
              await webpush.sendNotification(
                subscriber.subscription,
                JSON.stringify({
                  title: '⚽ GOAL!',
                  body: `${match.teams.home.name} ${goalsHome} - ${goalsAway} ${match.teams.away.name}`,
                  icon: '/icon-192x192.png',
                  data: { matchId: fixtureId, goalsHome, goalsAway }
                })
              );
              console.log(`⚽ Goal notification sent for match ${fixtureId}`);
            } catch (pushError) {
              console.error('❌ Goal notification error:', pushError.message);
            }
          }
        }
      }
    } catch (eventError) {
      console.error('❌ Events fetch error:', eventError.message);
    }
    
    // تشكيلة
    if (!state.lineupNotified) {
      try {
        const lineupsData = await fetchFromAPI('fixtures/lineups', { fixture: fixtureId }, false);
        const lineups = lineupsData.response || [];
        if (lineups.length > 0) {
          state.lineupNotified = true;
          for (const subscriber of pushSubscribers) {
            if (subscriber.favoriteTeamIds.includes(homeId) || subscriber.favoriteTeamIds.includes(awayId)) {
              try {
                await webpush.sendNotification(
                  subscriber.subscription,
                  JSON.stringify({
                    title: '📋 Lineups Available',
                    body: `Lineups are now available for ${match.teams.home.name} vs ${match.teams.away.name}`,
                    icon: '/icon-192x192.png',
                    data: { matchId: fixtureId }
                  })
                );
                console.log(`📋 Lineup notification sent for match ${fixtureId}`);
              } catch (pushError) {
                console.error('❌ Lineup notification error:', pushError.message);
              }
            }
          }
        }
      } catch (lineupError) {
        console.error('❌ Lineup fetch error:', lineupError.message);
      }
    }
  }
}

// Match event notifications interval (every 30 seconds for critical events)
setInterval(sendMatchEventNotifications, 30 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شاغل على: http://localhost:${PORT}`);
  console.log(`🌐 Network interfaces:`);
  console.log(`   - http://localhost:${PORT} (localhost)`);   
  console.log(`   - http://127.0.0.1:${PORT} (IPv4)`);        
  console.log(`   - http://0.0.0.0:${PORT} (All interfaces)`);
});

// Export for Vercel
module.exports = app;
