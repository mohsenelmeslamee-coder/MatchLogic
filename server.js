require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

// المفتاح يُقرأ حصرياً من البيئة ولا يُطبع أبداً في الـ log
if (!process.env.FOOTBALL_API_KEY) {
  console.error("❌ FOOTBALL_API_KEY غير موجود في ملف .env");
  process.exit(1);
}

const myCache = new NodeCache({ stdTTL: 300 });

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

const BASE_URL = "https://v3.football.api-sports.io";

async function fetchFromAPI(endpoint, params = {}, useCache = true) {
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
          'x-apisports-key': process.env.FOOTBALL_API_KEY // من process.env فقط
        }
      }
    );

    if (useCache) myCache.set(cacheKey, response.data);
    return response.data;

  } catch (error) {
    console.error(`❌ خطأ في ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

////////////////////////////////////////////////////
// 📅 مباريات حسب التاريخ
////////////////////////////////////////////////////
app.get('/api/matches', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: "Date is required" });
    }

    const data = await fetchFromAPI('fixtures', { date });
    res.json(data);

  } catch (error) {
    res.status(500).json({ error: "خطأ في جلب المباريات" });
  }
});

////////////////////////////////////////////////////
// ⚽ أحداث
////////////////////////////////////////////////////
app.get('/api/match/events/:id', async (req, res) => {
  try {
    const data = await fetchFromAPI('fixtures/events', { fixture: req.params.id });
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
    const data = await fetchFromAPI('fixtures/lineups', { fixture: req.params.id });
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
    const data = await fetchFromAPI('fixtures/statistics', { fixture: req.params.id });
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
    const data = await fetchFromAPI('teams', { search: q });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "خطأ في البحث عن الفرق" });
  }
});

////////////////////////////////////////////////////
// 🔔 Push: مفتاح VAPID العام + تسجيل الاشتراك
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

////////////////////////////////////////////////////
app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على: http://localhost:${PORT}`);
});
