require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// المفتاح يُقرأ حصرياً من البيئة ولا يُطبع أبداً في الـ log
if (!process.env.FOOTBALL_API_KEY) {
  console.error("❌ FOOTBALL_API_KEY غير موجود في ملف .env");
  process.exit(1);
}

// Cache configuration for RapidAPI - Hierarchical Smart Caching
const myCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes for general cache (will be overridden by smart TTL)
  checkperiod: 60 // Check for expired keys every minute
});

// Smart Team Cache for 24 hours
const teamCache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24 hours in seconds

// Request deduplication to prevent duplicate API calls
const pendingRequests = new Map();

// Hierarchical caching strategy with intelligent TTL
const CACHE_STRATEGY = {
  live_matches: 2 * 60 * 1000,      // 2 minutes for live matches
  finished_matches: 15 * 60 * 1000,  // 15 minutes for finished matches
  team_data: 24 * 60 * 60 * 1000,    // 24 hours for team data
  league_data: 7 * 24 * 60 * 60 * 1000 // 7 days for league data
};

// Request deduplication function
async function deduplicateRequest(key, apiCall) {
  if (pendingRequests.has(key)) {
    console.log(`🔄 Request deduplicated: ${key}`);
    return pendingRequests.get(key);
  }
  const promise = apiCall();
  pendingRequests.set(key, promise);
  promise.finally(() => pendingRequests.delete(key));
  return promise;
}

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

// Remove Express default headers for security
app.disable('x-powered-by');

// Set proper cache headers for static vs dynamic assets
app.use('/css/', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for CSS
  next();
});

app.use('/js/', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for JS
  next();
});

app.use('/icons/', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for icons
  next();
});

app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Rate limiting for RapidAPI - API Compliant (8 requests per minute)
const apiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 8, // 8 requests per minute (API requirement)
    message: 'API rate limit exceeded. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Skip rate limiting for stress tests
    skip: (req) => {
        return req.headers['x-stress-test'] === 'true';
    }
});

app.use('/api/', apiRateLimit);

// Add CORS and other middleware after cache headers
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.FOOTBALL_API_KEY; // Restore environment variable

async function fetchFromAPI(endpoint, params = {}, useCache = true, priority = 'normal') {
  const cacheKey = endpoint + JSON.stringify(params);
  
  // Check cache first
  if (useCache) {
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      console.log("⚡ من الكاش:", endpoint);
      return cachedData;
    }
  }

  // Use request deduplication
  const requestKey = `${endpoint}-${JSON.stringify(params)}`;
  return deduplicateRequest(requestKey, async () => {
    try {
      if (useCache) console.log("🌍 طلب جديد:", endpoint);

      const response = await axios.get(
        `${BASE_URL}/${endpoint}`,
        {
          params,
          headers: {
            'x-apisports-key': API_KEY, // API key from environment
            'User-Agent': 'MatchLogic/1.0', // Clean user agent
            'Accept': 'application/json', // Explicit accept header
            'Accept-Encoding': 'gzip, deflate' // Compression support
          }
        }
      );

      const data = response.data;
      
      // Smart caching based on content type
      if (useCache) {
        let ttl = 300; // Default 5 minutes
        
        // Determine TTL based on endpoint and content
        if (endpoint === 'fixtures') {
          const hasLiveMatches = data.response?.some(match => {
            const status = match.fixture?.status?.short;
            return status && status !== 'NS' && status !== 'FT' && status !== 'AET' && status !== 'PEN' && status !== 'PST';
          });
          ttl = hasLiveMatches ? CACHE_STRATEGY.live_matches / 1000 : CACHE_STRATEGY.finished_matches / 1000;
        } else if (endpoint === 'teams') {
          ttl = CACHE_STRATEGY.team_data / 1000;
        } else if (endpoint.includes('league')) {
          ttl = CACHE_STRATEGY.league_data / 1000;
        }
        
        myCache.set(cacheKey, data, ttl);
        console.log(`💾 Cached ${endpoint} with TTL: ${ttl}s`);
      }
      
      return data;

    } catch (error) {
      console.error("❌ API Error:", error.message);
      return {};
    }
  });
}

async function fetchTeamDetails(teamId) {
  const cacheKey = `team-${teamId}`;
  
  // Check team cache first (24 hours TTL)
  let teamData = teamCache.get(cacheKey);
  if (teamData) {
    console.log("⚡ Team from cache:", teamId);
    return teamData;
  }
  
  try {
    const response = await fetchFromAPI('teams', { id: teamId }, false);
    teamData = response.data.response?.[0] || {};
    if (teamData) {
      // Cache team data for 24 hours
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
    
    // Fetch with smart caching
    const data = await fetchFromAPI('fixtures', { date });
    
    console.log(`📊 API Response:`, data);
    res.json(data);

  } catch (error) {
    console.error('❌ Error in /api/matches:', error.message);
    res.status(500).json({ error: "خطأ في جلب المباريات" });
  }
});

// Dynamic sitemap generation
app.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.w3.org/1999/xhtml
        http://www.w3.org/2001/XMLSchema-instance">
    
    <!-- Homepage -->
    <url>
        <loc>https://matchlogic.vercel.app/</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    
    <!-- Match pages (dynamic pattern) -->
    <url>
        <loc>https://matchlogic.vercel.app/match.html</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>hourly</changefreq>
        <priority>0.9</priority>
    </url>
    
    <!-- Today's matches -->
    <url>
        <loc>https://matchlogic.vercel.app/?date=today</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>hourly</changefreq>
        <priority>0.9</priority>
    </url>
    
    <!-- Yesterday's matches -->
    <url>
        <loc>https://matchlogic.vercel.app/?date=yesterday</loc>
        <lastmod>${yesterday}T00:00:00+00:00</lastmod>
        <changefreq>hourly</changefreq>
        <priority>0.9</priority>
    </url>
    
    <!-- Tomorrow's matches -->
    <url>
        <loc>https://matchlogic.vercel.app/?date=tomorrow</loc>
        <lastmod>${tomorrow}T00:00:00+00:00</lastmod>
        <changefreq>hourly</changefreq>
        <priority>0.9</priority>
    </url>
    
    <!-- Favorites page -->
    <url>
        <loc>https://matchlogic.vercel.app/#favorites</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>
    
    <!-- Settings page -->
    <url>
        <loc>https://matchlogic.vercel.app/#settings</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>
    
    <!-- PWA Manifest -->
    <url>
        <loc>https://matchlogic.vercel.app/manifest.json</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.6</priority>
    </url>
    
    <!-- App Icons -->
    <url>
        <loc>https://matchlogic.vercel.app/icons/icon-192x192.png</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.4</priority>
    </url>
    
    <url>
        <loc>https://matchlogic.vercel.app/icons/icon-512x512.png</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.4</priority>
    </url>
    
    <url>
        <loc>https://matchlogic.vercel.app/icons/apple-touch-icon.png</loc>
        <lastmod>${today}T00:00:00+00:00</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.4</priority>
    </url>
    
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache sitemap for 1 hour
  res.send(sitemap);
});

// JSON-LD Structured Data endpoint for football events
app.get('/api/structured-data', async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    
    // Fetch today's matches
    const matchesData = await fetchFromAPI('fixtures', { date: today });
    const matches = matchesData.response || [];
    
    // Generate structured data for top 5 matches
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      "name": "Football Matches - MatchLogic",
      "description": "Live football scores and match information",
      "startDate": new Date().toISOString(),
      "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
      "eventStatus": "https://schema.org/EventScheduled",
      "url": "https://matchlogic.vercel.app/",
      "image": "https://matchlogic.vercel.app/icons/icon-512x512.png",
      "organizer": {
        "@type": "Organization",
        "name": "MatchLogic",
        "url": "https://matchlogic.vercel.app/"
      },
      "subEvent": matches.slice(0, 5).map(match => ({
        "@type": "SportsEvent",
        "name": `${match.teams?.home?.name} vs ${match.teams?.away?.name}`,
        "startDate": match.fixture?.date,
        "competitor": [
          {
            "@type": "SportsTeam",
            "name": match.teams?.home?.name,
            "image": match.teams?.home?.logo
          },
          {
            "@type": "SportsTeam", 
            "name": match.teams?.away?.name,
            "image": match.teams?.away?.logo
          }
        ],
        "location": {
          "@type": "Place",
          "name": match.fixture?.venue?.name || "Stadium"
        }
      }))
    };
    
    res.json(structuredData);
  } catch (error) {
    console.error('❌ Error generating structured data:', error.message);
    res.status(500).json({ error: "Failed to generate structured data" });
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

// Health check endpoint for monitoring
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage(),
    cache: {
      myCache: myCache.getStats(),
      teamCache: teamCache.getStats()
    },
    rateLimit: {
      pendingRequests: pendingRequests.size
    }
  };
  
  res.json(healthStatus);
});

// Cache warming on server start - Only if API key is available
async function warmCache() {
  try {
    // Skip cache warming if no API key (development without key)
    if (!process.env.FOOTBALL_API_KEY) {
      console.log('⚠️ Skipping cache warming - No API key available');
      return;
    }
    
    console.log('🔥 Warming cache on server start...');
    const today = new Date().toISOString().split('T')[0];
    await fetchFromAPI('fixtures', { date: today });
    console.log('✅ Cache warming completed');
  } catch (error) {
    console.error('❌ Cache warming failed:', error.message);
  }
}

// Warm cache after server starts - Only if API key available
if (process.env.FOOTBALL_API_KEY) {
  setTimeout(warmCache, 3000); // Delay to allow server to fully start
} else {
  console.log('⚠️ Skipping cache warming - No API key available');
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
