const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const submissionHistory = new Map();
const loginHistory = new Map();

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.static(__dirname));

// STRONA GŁÓWNA
// Wyświetla home.html bez zmiany adresu na /home.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function isRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function canSubmit(ip) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentSubmissions = (submissionHistory.get(ip) || [])
    .filter(timestamp => timestamp > oneHourAgo);

  if (recentSubmissions.length >= 5) {
    submissionHistory.set(ip, recentSubmissions);
    return false;
  }

  recentSubmissions.push(now);
  submissionHistory.set(ip, recentSubmissions);
  return true;
}

function canAttemptLogin(ip) {
  const now = Date.now();
  const fifteenMinutesAgo = now - 15 * 60 * 1000;
  const recentAttempts = (loginHistory.get(ip) || [])
    .filter(timestamp => timestamp > fifteenMinutesAgo);

  if (recentAttempts.length >= 10) {
    loginHistory.set(ip, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  loginHistory.set(ip, recentAttempts);
  return true;
}

function safeEqual(firstValue, secondValue) {
  const first = Buffer.from(firstValue);
  const second = Buffer.from(secondValue);

  return first.length === second.length
    && crypto.timingSafeEqual(first, second);
}

function createAdminToken() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ expiresAt })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || !ADMIN_SECRET) {
    return false;
  }

  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(payload)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.expiresAt) && data.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';

  for (const cookie of cookies.split(';')) {
    const [cookieName, ...valueParts] = cookie.trim().split('=');

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return '';
}

function requireAdmin(req, res, next) {
  const token = getCookie(req, 'admin_session');

  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: '請先登入管理員帳號。' });
  }

  return next();
}

// LOGOWANIE ADMINISTRATORA
app.post('/api/admin/login', (req, res) => {
  if (!canAttemptLogin(req.ip)) {
    return res.status(429).json({
      error: '登入嘗試次數過多，請於 15 分鐘後再試。'
    });
  }

  const password = typeof req.body.password === 'string'
    ? req.body.password
    : '';

  if (!ADMIN_PASSWORD || !ADMIN_SECRET || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: '管理員密碼不正確。' });
  }

  const token = createAdminToken();
  res.setHeader(
    'Set-Cookie',
    `admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
  );

  loginHistory.delete(req.ip);
  return res.json({ status: 'ok' });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );

  return res.json({ status: 'ok' });
});

app.get('/api/admin/opinions', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        line,
        ship,
        TO_CHAR(cruise_date, 'YYYY-MM-DD') AS date,
        author,
        title,
        review_text AS text,
        rating_decor,
        rating_room,
        rating_service,
        rating_food,
        status,
        created_at
      FROM opinions
      ORDER BY
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          ELSE 3
        END,
        created_at DESC,
        id DESC
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error('Unable to load admin opinions:', error);
    return res.status(500).json({ error: '暫時無法取得評價，請稍後再試。' });
  }
});

app.patch('/api/admin/opinions/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const allowedStatuses = ['pending', 'approved', 'rejected'];
  const status = req.body.status;

  if (!Number.isInteger(id) || id <= 0 || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: '提交的資料不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE opinions
        SET status = $1
        WHERE id = $2
        RETURNING id, status
      `,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Unable to update opinion:', error);
    return res.status(500).json({ error: '暫時無法更新評價，請稍後再試。' });
  }
});

app.delete('/api/admin/opinions/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM opinions WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    return res.json({ status: 'ok', id });
  } catch (error) {
    console.error('Unable to delete opinion:', error);
    return res.status(500).json({ error: '暫時無法刪除評價，請稍後再試。' });
  }
});

// POBIERANIE ZATWIERDZONYCH OPINII
app.get('/api/opinions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        line,
        ship,
        TO_CHAR(cruise_date, 'YYYY-MM-DD') AS date,
        author,
        title,
        review_text AS text,
        rating_decor,
        rating_room,
        rating_service,
        rating_food,
        created_at
      FROM opinions
      WHERE status = 'approved'
      ORDER BY created_at DESC, id DESC
    `);

    const opinions = result.rows.map(row => ({
      id: row.id,
      line: row.line,
      ship: row.ship,
      date: row.date,
      author: row.author,
      title: row.title,
      text: row.text,
      ratings: {
        decor: row.rating_decor,
        room: row.rating_room,
        service: row.rating_service,
        food: row.rating_food
      },
      createdAt: row.created_at
    }));

    return res.json(opinions);
  } catch (error) {
    console.error('Unable to load opinions:', error);
    return res.status(500).json({
      error: '暫時無法載入評價，請稍後再試。'
    });
  }
});

// ZAPISYWANIE OPINII
app.post('/add-opinion', async (req, res) => {
  const ratings = req.body.ratings || {};
  const newOpinion = {
    title: cleanText(req.body.title, 100),
    text: cleanText(req.body.text, 3000),
    line: cleanText(req.body.line, 60),
    ship: cleanText(req.body.ship, 100),
    date: cleanText(req.body.date, 10),
    ratings: {
      decor: Number(ratings.decor),
      room: Number(ratings.room),
      service: Number(ratings.service),
      food: Number(ratings.food)
    },
    author: cleanText(req.body.author, 60)
  };

  const hasRequiredText = newOpinion.title
    && newOpinion.text
    && newOpinion.line
    && newOpinion.ship
    && newOpinion.date
    && newOpinion.author;

  const ratingsAreValid = Object.values(newOpinion.ratings).every(isRating);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(newOpinion.date);

  if (!hasRequiredText || !ratingsAreValid || !dateIsValid) {
    return res.status(400).json({
      error: '請檢查所有欄位是否已正確填寫。'
    });
  }

  if (!canSubmit(req.ip)) {
    return res.status(429).json({
      error: '已超過每小時可提交的評價數量，請稍後再試。'
    });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO opinions (
          line,
          ship,
          cruise_date,
          author,
          title,
          review_text,
          rating_decor,
          rating_room,
          rating_service,
          rating_food,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        RETURNING id, status
      `,
      [
        newOpinion.line,
        newOpinion.ship,
        newOpinion.date,
        newOpinion.author,
        newOpinion.title,
        newOpinion.text,
        newOpinion.ratings.decor,
        newOpinion.ratings.room,
        newOpinion.ratings.service,
        newOpinion.ratings.food
      ]
    );

    return res.status(201).json({
      status: 'ok',
      id: result.rows[0].id,
      reviewStatus: result.rows[0].status
    });
  } catch (error) {
    console.error('Unable to save opinion:', error);
    return res.status(500).json({
      error: '暫時無法保存評價，請稍後再試。'
    });
  }
});

// URUCHOMIENIE SERWERA
async function startServer() {
  try {
    await pool.query('SELECT 1');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Connected to PostgreSQL');
    });
  } catch (error) {
    console.error('Unable to connect to PostgreSQL:', error);
    process.exit(1);
  }
}

startServer();
