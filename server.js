const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const TERMS_VERSION = '2026-08-01';
const NEON_AUTH_URL = (process.env.NEON_AUTH_URL || '').replace(/\/+$/, '');
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL
  || (NEON_AUTH_URL ? `${NEON_AUTH_URL}/.well-known/jwks.json` : '');
const NEON_API_KEY = process.env.NEON_API_KEY || '';
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID || '';
const NEON_BRANCH_ID = process.env.NEON_BRANCH_ID || '';
const submissionHistory = new Map();
const loginHistory = new Map();
let remoteJwks;

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

// CZYSTE ADRESY STRON
// Pliki HTML pozostają wewnętrznymi szablonami, ale nie są widoczne w adresie.
function sendPage(fileName) {
  return (req, res) => res.sendFile(path.join(__dirname, fileName));
}

app.get('/cruise-lines/:line', sendPage('line.html'));
app.get('/ships/:ship', sendPage('ship.html'));
app.get('/groups/:group', sendPage('group.html'));

app.get('/account', sendPage('account.html'));
app.get('/terms', sendPage('terms.html'));

app.get('/add-review', sendPage('add-review.html'));
app.get('/add-review/:line', sendPage('add-review.html'));
app.get('/add-review/:line/:ship', sendPage('add-review.html'));

app.get('/thank-you', sendPage('thank-you.html'));
app.get('/thank-you/:line', sendPage('thank-you.html'));
app.get('/thank-you/:line/:ship', sendPage('thank-you.html'));

app.get('/admin', sendPage('admin.html'));

// Publiczny adres usługi Auth jest potrzebny przeglądarce.
// Hasła, klucze administratora i DATABASE_URL nigdy nie trafiają do tej odpowiedzi.
app.get('/api/config', (req, res) => {
  return res.json({ neonAuthUrl: NEON_AUTH_URL });
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

function isValidDisplayName(value) {
  return value.length >= 2
    && value.length <= 30
    && !/[\u0000-\u001F\u007F]/u.test(value);
}

async function syncUserProfile(auth) {
  const displayName = cleanText(auth.name, 30);

  if (!isValidDisplayName(displayName)) {
    return null;
  }

  const result = await pool.query(
    `
      INSERT INTO user_profiles (user_id, display_name)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO NOTHING
      RETURNING display_name
    `,
    [auth.userId, displayName]
  );

  return result.rows[0]?.display_name || displayName;
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

function getBearerToken(req) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return '';
  }

  return token;
}

async function verifyUserToken(token) {
  if (!NEON_AUTH_JWKS_URL) {
    const error = new Error('Neon Auth is not configured');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }

  const { createRemoteJWKSet, jwtVerify } = await import('jose');

  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
  }

  const { payload } = await jwtVerify(token, remoteJwks, {
    clockTolerance: 10
  });

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Token does not identify a user');
  }

  return payload;
}

async function requireUser(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: '請先登入，才能分享你的搭乘體驗。'
    });
  }

  try {
    const payload = await verifyUserToken(token);
    req.auth = {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : ''
    };
    return next();
  } catch (error) {
    if (error.code === 'AUTH_NOT_CONFIGURED') {
      console.error('Unable to verify user: Neon Auth environment is missing');
      return res.status(503).json({
        error: '登入服務尚未設定完成，請稍後再試。'
      });
    }

    return res.status(401).json({
      error: '登入已失效，請重新登入。'
    });
  }
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
        opinions.id,
        opinions.line,
        opinions.ship,
        TO_CHAR(opinions.cruise_date, 'YYYY-MM-DD') AS date,
        COALESCE(user_profiles.display_name, opinions.author) AS author,
        opinions.title,
        opinions.review_text AS text,
        opinions.rating_decor,
        opinions.rating_room,
        opinions.rating_service,
        opinions.rating_food,
        opinions.status,
        opinions.created_at
      FROM opinions
      LEFT JOIN user_profiles
        ON user_profiles.user_id = opinions.user_id
      ORDER BY
        CASE opinions.status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          ELSE 3
        END,
        opinions.created_at DESC,
        opinions.id DESC
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
        opinions.id,
        opinions.line,
        opinions.ship,
        TO_CHAR(opinions.cruise_date, 'YYYY-MM-DD') AS date,
        COALESCE(user_profiles.display_name, opinions.author) AS author,
        opinions.title,
        opinions.review_text AS text,
        opinions.rating_decor,
        opinions.rating_room,
        opinions.rating_service,
        opinions.rating_food,
        opinions.created_at
      FROM opinions
      LEFT JOIN user_profiles
        ON user_profiles.user_id = opinions.user_id
      WHERE opinions.status = 'approved'
      ORDER BY opinions.created_at DESC, opinions.id DESC
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

// OPINIE ZALOGOWANEGO UŻYTKOWNIKA — razem ze statusem moderacji.
app.get('/api/me/opinions', requireUser, async (req, res) => {
  try {
    await syncUserProfile(req.auth);

    const result = await pool.query(
      `
        SELECT
          id,
          line,
          ship,
          TO_CHAR(cruise_date, 'YYYY-MM-DD') AS date,
          title,
          review_text AS text,
          rating_decor,
          rating_room,
          rating_service,
          rating_food,
          status,
          created_at
        FROM opinions
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [req.auth.userId]
    );

    const opinions = result.rows.map(row => ({
      id: row.id,
      line: row.line,
      ship: row.ship,
      date: row.date,
      title: row.title,
      text: row.text,
      status: row.status,
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
    console.error('Unable to load user opinions:', error);
    return res.status(500).json({
      error: '暫時無法載入你的評價，請稍後再試。'
    });
  }
});

// AKTUALIZACJA NAZWY PROFILU.
// Nazwa jest też zachowywana w istniejących opiniach jako bezpieczna kopia.
app.put('/api/me/profile', requireUser, async (req, res) => {
  const displayName = cleanText(req.body.displayName, 30);

  if (!isValidDisplayName(displayName)) {
    return res.status(400).json({
      error: '顯示名稱需要 2 到 30 個字元，且不能包含換行。'
    });
  }

  try {
    const result = await pool.query(
      `
        WITH saved_profile AS (
          INSERT INTO user_profiles (user_id, display_name)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
          RETURNING display_name
        ),
        updated_opinions AS (
          UPDATE opinions
          SET author = $2
          WHERE user_id = $1
          RETURNING id
        )
        SELECT
          saved_profile.display_name,
          (SELECT COUNT(*)::INTEGER FROM updated_opinions) AS updated_opinions
        FROM saved_profile
      `,
      [req.auth.userId, displayName]
    );

    return res.json({
      status: 'ok',
      displayName: result.rows[0].display_name,
      updatedOpinions: result.rows[0].updated_opinions
    });
  } catch (error) {
    console.error('Unable to update user profile:', error);
    return res.status(500).json({
      error: '暫時無法更新顯示名稱，請稍後再試。'
    });
  }
});

// ZAPISANIE WERSJI ZASAD zaakceptowanej podczas rejestracji.
app.post('/api/me/terms-acceptance', requireUser, async (req, res) => {
  const displayName = cleanText(req.auth.name, 30);

  if (!isValidDisplayName(displayName)) {
    return res.status(400).json({ error: '顯示名稱不正確。' });
  }

  try {
    await pool.query(
      `
        INSERT INTO user_profiles (
          user_id,
          display_name,
          terms_version,
          terms_accepted_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          terms_version = EXCLUDED.terms_version,
          terms_accepted_at = EXCLUDED.terms_accepted_at,
          updated_at = NOW()
      `,
      [req.auth.userId, displayName, TERMS_VERSION]
    );

    return res.json({ status: 'ok', termsVersion: TERMS_VERSION });
  } catch (error) {
    console.error('Unable to save terms acceptance:', error);
    return res.status(500).json({
      error: '暫時無法保存同意紀錄，請稍後再試。'
    });
  }
});

// TRWAŁE USUNIĘCIE KONTA.
// Identyfikator użytkownika pochodzi wyłącznie ze sprawdzonego JWT, nigdy z body.
// Klucz administracyjny Neon jest przechowywany tylko w Render Environment.
app.delete('/api/me/account', requireUser, async (req, res) => {
  if (!NEON_API_KEY || !NEON_PROJECT_ID || !NEON_BRANCH_ID) {
    console.error('Account deletion is not configured: missing Neon API environment variables');
    return res.status(503).json({
      error: '帳號刪除功能尚未設定完成，請稍後再試。'
    });
  }

  const client = await pool.connect();
  let authUserDeleted = false;

  try {
    await client.query('BEGIN');
    const opinionsResult = await client.query(
      'DELETE FROM opinions WHERE user_id = $1',
      [req.auth.userId]
    );
    await client.query(
      'DELETE FROM user_profiles WHERE user_id = $1',
      [req.auth.userId]
    );

    const deleteUrl = [
      'https://console.neon.tech/api/v2/projects',
      encodeURIComponent(NEON_PROJECT_ID),
      'branches',
      encodeURIComponent(NEON_BRANCH_ID),
      'auth/users',
      encodeURIComponent(req.auth.userId)
    ].join('/');

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${NEON_API_KEY}`
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!deleteResponse.ok) {
      const responseText = await deleteResponse.text().catch(() => '');
      console.error(
        'Neon API could not delete auth user:',
        deleteResponse.status,
        responseText.slice(0, 500)
      );
      throw new Error(`NEON_ACCOUNT_DELETE_FAILED_${deleteResponse.status}`);
    }

    authUserDeleted = true;
    await client.query('COMMIT');

    return res.json({
      status: 'ok',
      deletedOpinions: opinionsResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    // Jeśli Neon usunął konto, ale zatwierdzenie transakcji nie powiodło się,
    // ponawiamy samo czyszczenie danych aplikacji bez wymagania tokenu użytkownika.
    if (authUserDeleted) {
      await pool.query('DELETE FROM opinions WHERE user_id = $1', [req.auth.userId])
        .catch(cleanupError => console.error('Unable to finish opinion cleanup:', cleanupError));
      await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [req.auth.userId])
        .catch(cleanupError => console.error('Unable to finish profile cleanup:', cleanupError));
    }

    console.error('Unable to delete user data:', error);
    return res.status(500).json({
      error: '目前無法刪除帳號，請稍後再試。'
    });
  } finally {
    client.release();
  }
});

// ZAPISYWANIE OPINII — tylko dla zalogowanych użytkowników.
app.post('/add-opinion', requireUser, async (req, res) => {
  const ratings = req.body.ratings || {};
  const profileName = cleanText(req.auth.name, 60);
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
    author: profileName || cleanText(req.body.author, 60)
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

  if (!canSubmit(`${req.auth.userId}:${req.ip}`)) {
    return res.status(429).json({
      error: '已超過每小時可提交的評價數量，請稍後再試。'
    });
  }

  try {
    await syncUserProfile({
      ...req.auth,
      name: newOpinion.author
    });

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
          status,
          user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
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
        newOpinion.ratings.food,
        req.auth.userId
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        display_name VARCHAR(30) NOT NULL,
        terms_version TEXT,
        terms_accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS terms_version TEXT
    `);
    await pool.query(`
      ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE opinions
      ADD COLUMN IF NOT EXISTS user_id TEXT
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS opinions_user_id_index
      ON opinions (user_id)
    `);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Connected to PostgreSQL');
    });
  } catch (error) {
    console.error('Unable to connect to PostgreSQL:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, pool, startServer };
