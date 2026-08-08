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
const commentHistory = new Map();
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
app.get('/edit-review/:id', sendPage('add-review.html'));

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

// Odznaki są wyliczane wyłącznie z liczby zatwierdzonych opinii.
// Nie zapisujemy poziomu w bazie, dzięki czemu awans następuje automatycznie.
function reviewBadgeForCount(value) {
  const count = Number(value) || 0;

  if (count >= 16) {
    return { key: 'cruise-expert', label: '郵輪專家' };
  }

  if (count >= 11) {
    return { key: 'veteran-navigator', label: '資深航海家' };
  }

  if (count >= 7) {
    return { key: 'cruise-master', label: '郵輪達人' };
  }

  if (count >= 4) {
    return { key: 'sea-traveler', label: '航海旅人' };
  }

  if (count >= 2) {
    return { key: 'advanced-sailor', label: '進階水手' };
  }

  if (count >= 1) {
    return { key: 'new-sailor', label: '新人水手' };
  }

  return null;
}

function isRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function opinionInputFromRequest(req) {
  const body = req.body || {};
  const ratings = body.ratings || {};
  const profileName = cleanText(req.auth.name, 60);

  return {
    title: cleanText(body.title, 100),
    text: cleanText(body.text, 3000),
    line: cleanText(body.line, 60),
    ship: cleanText(body.ship, 100),
    date: cleanText(body.date, 10),
    ratings: {
      decor: Number(ratings.decor),
      room: Number(ratings.room),
      service: Number(ratings.service),
      food: Number(ratings.food)
    },
    author: profileName
  };
}

function opinionInputIsValid(opinion) {
  const hasRequiredText = opinion.title
    && opinion.text
    && opinion.line
    && opinion.ship
    && opinion.date
    && opinion.author;
  const ratingsAreValid = Object.values(opinion.ratings).every(isRating);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(opinion.date);

  return Boolean(hasRequiredText && ratingsAreValid && dateIsValid);
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

function canSubmitComment(key) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentSubmissions = (commentHistory.get(key) || [])
    .filter(timestamp => timestamp > oneHourAgo);

  if (recentSubmissions.length >= 20) {
    commentHistory.set(key, recentSubmissions);
    return false;
  }

  recentSubmissions.push(now);
  commentHistory.set(key, recentSubmissions);
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
    req.auth = userAuthFromPayload(payload);
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

function userAuthFromPayload(payload) {
  return {
    userId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : ''
  };
}

// Publiczne pobieranie komentarzy może opcjonalnie rozpoznać użytkownika.
// Niepoprawny lub wygasły token nie daje żadnych uprawnień i jest traktowany jak brak logowania.
async function optionalUser(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = await verifyUserToken(token);
    req.auth = userAuthFromPayload(payload);
  } catch {
    req.auth = null;
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
        opinions.deleted_at,
        opinions.deleted_by,
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
        opinions.deleted_at DESC NULLS LAST,
        opinions.created_at DESC,
        opinions.id DESC
    `);

    return res.json(result.rows);
  } catch (error) {
    console.error('Unable to load admin opinions:', error);
    return res.status(500).json({ error: '暫時無法取得評價，請稍後再試。' });
  }
});

// LICZNIK NOWYCH KOMENTARZY W PANELU ADMINISTRATORA.
app.get('/api/admin/comments/unread-count', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::INTEGER AS count
      FROM comments
      WHERE admin_seen_at IS NULL
    `);

    return res.json({ count: Number(result.rows[0]?.count) || 0 });
  } catch (error) {
    console.error('Unable to count unread comments:', error);
    return res.status(500).json({ error: '暫時無法取得新留言數量，請稍後再試。' });
  }
});

// WSZYSTKIE KOMENTARZE W JEDNYM MIEJSCU — najnowsze na górze.
app.get('/api/admin/comments', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        comments.id,
        comments.opinion_id,
        comments.parent_comment_id,
        comments.comment_text AS text,
        COALESCE(user_profiles.display_name, '郵輪旅人') AS author,
        comments.created_at,
        comments.edited_at,
        comments.admin_seen_at IS NULL AS is_new,
        opinions.title AS opinion_title,
        opinions.line,
        opinions.ship,
        opinions.status AS opinion_status,
        opinions.deleted_at AS opinion_deleted_at
      FROM comments
      INNER JOIN opinions
        ON opinions.id = comments.opinion_id
      LEFT JOIN user_profiles
        ON user_profiles.user_id = comments.user_id
      WHERE comments.admin_seen_at IS NULL
      ORDER BY comments.created_at DESC, comments.id DESC
    `);

    return res.json(result.rows.map(row => ({
      id: row.id,
      opinionId: row.opinion_id,
      isReply: Boolean(row.parent_comment_id),
      text: row.text,
      author: row.author,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      isNew: Boolean(row.is_new),
      opinionTitle: row.opinion_title,
      line: row.line,
      ship: row.ship,
      opinionIsPublic: row.opinion_status === 'approved' && !row.opinion_deleted_at
    })));
  } catch (error) {
    console.error('Unable to load admin comments:', error);
    return res.status(500).json({ error: '暫時無法取得留言，請稍後再試。' });
  }
});

// OZNACZENIE WYŚWIETLONYCH KOMENTARZY JAKO PRZECZYTANE.
app.patch('/api/admin/comments/seen', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))]
    : [];

  if (ids.length === 0 || ids.length > 500 || ids.some(id => id <= 0)) {
    return res.status(400).json({ error: '留言資料不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE comments
        SET admin_seen_at = NOW()
        WHERE id = ANY($1::BIGINT[])
          AND admin_seen_at IS NULL
      `,
      [ids]
    );

    return res.json({ status: 'ok', updated: result.rowCount });
  } catch (error) {
    console.error('Unable to mark comments as seen:', error);
    return res.status(500).json({ error: '暫時無法更新留言狀態，請稍後再試。' });
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
        WHERE id = $2 AND deleted_at IS NULL
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

// ZWYKŁE USUNIĘCIE W PANELU — przenosi opinię do kosza.
app.delete('/api/admin/opinions/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE opinions
        SET deleted_at = NOW(), deleted_by = 'admin'
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, deleted_at
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    return res.json({ status: 'ok', id: result.rows[0].id });
  } catch (error) {
    console.error('Unable to move opinion to recycle bin:', error);
    return res.status(500).json({ error: '暫時無法刪除評價，請稍後再試。' });
  }
});

// PRZYWRÓCENIE Z KOSZA — zawsze wraca do kolejki moderacji.
app.patch('/api/admin/opinions/:id/restore', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE opinions
        SET
          deleted_at = NULL,
          deleted_by = NULL,
          status = 'pending'
        WHERE id = $1 AND deleted_at IS NOT NULL
        RETURNING id, status
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '回收桶中找不到這則評價。' });
    }

    return res.json({ status: 'ok', id: result.rows[0].id });
  } catch (error) {
    console.error('Unable to restore opinion:', error);
    return res.status(500).json({ error: '暫時無法還原評價，請稍後再試。' });
  }
});

// TRWAŁE USUNIĘCIE — dozwolone wyłącznie dla wpisu znajdującego się w koszu.
app.delete('/api/admin/opinions/:id/permanent', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM opinions WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '回收桶中找不到這則評價。' });
    }

    return res.json({ status: 'ok', id: result.rows[0].id });
  } catch (error) {
    console.error('Unable to permanently delete opinion:', error);
    return res.status(500).json({ error: '暫時無法永久刪除評價，請稍後再試。' });
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
        CASE
          WHEN opinions.user_id IS NULL THEN 0
          ELSE COUNT(*) OVER (PARTITION BY opinions.user_id)
        END AS approved_review_count,
        COALESCE(comment_stats.comment_count, 0) AS comment_count,
        opinions.created_at
      FROM opinions
      LEFT JOIN user_profiles
        ON user_profiles.user_id = opinions.user_id
      LEFT JOIN (
        SELECT opinion_id, COUNT(*)::INTEGER AS comment_count
        FROM comments
        GROUP BY opinion_id
      ) AS comment_stats
        ON comment_stats.opinion_id = opinions.id
      WHERE opinions.status = 'approved'
        AND opinions.deleted_at IS NULL
      ORDER BY opinions.created_at DESC, opinions.id DESC
    `);

    const opinions = result.rows.map(row => {
      const approvedReviewCount = Number(row.approved_review_count) || 0;

      return {
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
        approvedReviewCount,
        badge: reviewBadgeForCount(approvedReviewCount),
        commentCount: Number(row.comment_count) || 0,
        createdAt: row.created_at
      };
    });

    return res.json(opinions);
  } catch (error) {
    console.error('Unable to load opinions:', error);
    return res.status(500).json({
      error: '暫時無法載入評價，請稍後再試。'
    });
  }
});

// PUBLICZNE KOMENTARZE POD ZATWIERDZONĄ OPINIĄ.
// Zalogowany użytkownik oraz administrator otrzymują informację, które wpisy mogą usunąć.
app.get('/api/opinions/:id/comments', optionalUser, async (req, res) => {
  const opinionId = Number(req.params.id);

  if (!Number.isInteger(opinionId) || opinionId <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  const isAdmin = verifyAdminToken(getCookie(req, 'admin_session'));

  try {
    const result = await pool.query(
      `
        SELECT
          comments.id,
          comments.comment_text AS text,
          comments.user_id,
          comments.parent_comment_id,
          COALESCE(user_profiles.display_name, '郵輪旅人') AS author,
          COALESCE(author_stats.approved_review_count, 0) AS approved_review_count,
          comments.created_at,
          comments.edited_at
        FROM comments
        INNER JOIN opinions
          ON opinions.id = comments.opinion_id
        LEFT JOIN user_profiles
          ON user_profiles.user_id = comments.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*)::INTEGER AS approved_review_count
          FROM opinions
          WHERE status = 'approved'
            AND deleted_at IS NULL
          GROUP BY user_id
        ) AS author_stats
          ON author_stats.user_id = comments.user_id
        WHERE comments.opinion_id = $1
          AND opinions.status = 'approved'
          AND opinions.deleted_at IS NULL
        ORDER BY comments.created_at ASC, comments.id ASC
      `,
      [opinionId]
    );

    return res.json(result.rows.map(row => {
      const approvedReviewCount = Number(row.approved_review_count) || 0;

      return {
        id: row.id,
        text: row.text,
        author: row.author,
        approvedReviewCount,
        badge: reviewBadgeForCount(approvedReviewCount),
        createdAt: row.created_at,
        editedAt: row.edited_at,
        parentCommentId: row.parent_comment_id,
        canReply: Boolean(req.auth?.userId && !row.parent_comment_id),
        canEdit: Boolean(req.auth?.userId === row.user_id),
        canDelete: Boolean(isAdmin || req.auth?.userId === row.user_id)
      };
    }));
  } catch (error) {
    console.error('Unable to load comments:', error);
    return res.status(500).json({ error: '暫時無法載入留言，請稍後再試。' });
  }
});

// DODANIE KOMENTARZA — tylko przez zalogowane konto i tylko pod publiczną opinią.
app.post('/api/opinions/:id/comments', requireUser, async (req, res) => {
  const opinionId = Number(req.params.id);
  const text = cleanText(req.body?.text, 1000);

  if (!Number.isInteger(opinionId) || opinionId <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  if (!text) {
    return res.status(400).json({ error: '請輸入留言內容。' });
  }

  if (!canSubmitComment(`${req.auth.userId}:${req.ip}`)) {
    return res.status(429).json({ error: '留言次數過多，請稍後再試。' });
  }

  try {
    const displayName = await syncUserProfile(req.auth);

    if (!displayName) {
      return res.status(400).json({ error: '帳號顯示名稱不正確。' });
    }

    const result = await pool.query(
      `
        INSERT INTO comments (opinion_id, user_id, comment_text)
        SELECT id, $2, $3
        FROM opinions
        WHERE id = $1
          AND status = 'approved'
          AND deleted_at IS NULL
        RETURNING id, opinion_id, created_at
      `,
      [opinionId, req.auth.userId, text]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則公開評價。' });
    }

    return res.status(201).json({
      status: 'ok',
      id: result.rows[0].id,
      opinionId: result.rows[0].opinion_id,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Unable to save comment:', error);
    return res.status(500).json({ error: '暫時無法發布留言，請稍後再試。' });
  }
});

// ODPOWIEDŹ NA KOMENTARZ — tylko jeden poziom, bez odpowiedzi na odpowiedzi.
app.post('/api/comments/:id/replies', requireUser, async (req, res) => {
  const parentCommentId = Number(req.params.id);
  const text = cleanText(req.body?.text, 1000);

  if (!Number.isInteger(parentCommentId) || parentCommentId <= 0) {
    return res.status(400).json({ error: '留言識別碼不正確。' });
  }

  if (!text) {
    return res.status(400).json({ error: '請輸入回覆內容。' });
  }

  if (!canSubmitComment(`${req.auth.userId}:${req.ip}`)) {
    return res.status(429).json({ error: '留言次數過多，請稍後再試。' });
  }

  try {
    const displayName = await syncUserProfile(req.auth);

    if (!displayName) {
      return res.status(400).json({ error: '帳號顯示名稱不正確。' });
    }

    const result = await pool.query(
      `
        INSERT INTO comments (
          opinion_id,
          user_id,
          comment_text,
          parent_comment_id
        )
        SELECT
          parent.opinion_id,
          $2,
          $3,
          parent.id
        FROM comments AS parent
        INNER JOIN opinions
          ON opinions.id = parent.opinion_id
        WHERE parent.id = $1
          AND parent.parent_comment_id IS NULL
          AND opinions.status = 'approved'
          AND opinions.deleted_at IS NULL
        RETURNING id, opinion_id, parent_comment_id, created_at
      `,
      [parentCommentId, req.auth.userId, text]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: '找不到這則留言，或這是一則回覆。'
      });
    }

    return res.status(201).json({
      status: 'ok',
      id: result.rows[0].id,
      opinionId: result.rows[0].opinion_id,
      parentCommentId: result.rows[0].parent_comment_id,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Unable to save comment reply:', error);
    return res.status(500).json({ error: '暫時無法發布回覆，請稍後再試。' });
  }
});

// EDYCJA KOMENTARZA — wyłącznie autor może zmienić treść własnego wpisu.
app.patch('/api/comments/:id', requireUser, async (req, res) => {
  const commentId = Number(req.params.id);
  const text = cleanText(req.body?.text, 1000);

  if (!Number.isInteger(commentId) || commentId <= 0) {
    return res.status(400).json({ error: '留言識別碼不正確。' });
  }

  if (!text) {
    return res.status(400).json({ error: '請輸入留言內容。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE comments
        SET comment_text = $1,
            edited_at = NOW(),
            admin_seen_at = NULL
        FROM opinions
        WHERE comments.id = $2
          AND comments.user_id = $3
          AND opinions.id = comments.opinion_id
          AND opinions.status = 'approved'
          AND opinions.deleted_at IS NULL
        RETURNING comments.id, comments.opinion_id, comments.edited_at
      `,
      [text, commentId, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則留言，或你沒有編輯權限。' });
    }

    return res.json({
      status: 'ok',
      id: result.rows[0].id,
      opinionId: result.rows[0].opinion_id,
      editedAt: result.rows[0].edited_at
    });
  } catch (error) {
    console.error('Unable to update comment:', error);
    return res.status(500).json({ error: '暫時無法更新留言，請稍後再試。' });
  }
});

// USUNIĘCIE KOMENTARZA — autor usuwa własny wpis, administrator dowolny.
app.delete('/api/comments/:id', optionalUser, async (req, res) => {
  const commentId = Number(req.params.id);
  const isAdmin = verifyAdminToken(getCookie(req, 'admin_session'));

  if (!Number.isInteger(commentId) || commentId <= 0) {
    return res.status(400).json({ error: '留言識別碼不正確。' });
  }

  if (!isAdmin && !req.auth?.userId) {
    return res.status(401).json({ error: '請先登入，才能刪除留言。' });
  }

  try {
    const result = await pool.query(
      `
        DELETE FROM comments
        WHERE id = $1
          AND ($2::BOOLEAN OR user_id = $3)
        RETURNING id, opinion_id
      `,
      [commentId, isAdmin, req.auth?.userId || '']
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則留言，或你沒有刪除權限。' });
    }

    return res.json({
      status: 'ok',
      id: result.rows[0].id,
      opinionId: result.rows[0].opinion_id
    });
  } catch (error) {
    console.error('Unable to delete comment:', error);
    return res.status(500).json({ error: '暫時無法刪除留言，請稍後再試。' });
  }
});

// LICZNIK NIEPRZECZYTANYCH ODPOWIEDZI DLA ZALOGOWANEGO UŻYTKOWNIKA.
app.get('/api/me/notifications/unread-count', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT COUNT(*)::INTEGER AS count
        FROM comments AS reply
        INNER JOIN comments AS parent
          ON parent.id = reply.parent_comment_id
        INNER JOIN opinions
          ON opinions.id = reply.opinion_id
        WHERE parent.user_id = $1
          AND reply.user_id <> $1
          AND reply.reply_read_at IS NULL
          AND opinions.status = 'approved'
          AND opinions.deleted_at IS NULL
      `,
      [req.auth.userId]
    );

    return res.json({ count: Number(result.rows[0]?.count) || 0 });
  } catch (error) {
    console.error('Unable to count user notifications:', error);
    return res.status(500).json({ error: '暫時無法取得通知數量，請稍後再試。' });
  }
});

// NIEPRZECZYTANE ODPOWIEDZI W PANELU KONTA.
app.get('/api/me/notifications', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          reply.id AS reply_id,
          reply.opinion_id,
          reply.comment_text AS reply_text,
          reply.created_at,
          COALESCE(reply_profile.display_name, '郵輪旅人') AS reply_author,
          parent.comment_text AS original_text,
          opinions.title AS opinion_title,
          opinions.line,
          opinions.ship
        FROM comments AS reply
        INNER JOIN comments AS parent
          ON parent.id = reply.parent_comment_id
        INNER JOIN opinions
          ON opinions.id = reply.opinion_id
        LEFT JOIN user_profiles AS reply_profile
          ON reply_profile.user_id = reply.user_id
        WHERE parent.user_id = $1
          AND reply.user_id <> $1
          AND reply.reply_read_at IS NULL
          AND opinions.status = 'approved'
          AND opinions.deleted_at IS NULL
        ORDER BY reply.created_at DESC, reply.id DESC
      `,
      [req.auth.userId]
    );

    return res.json(result.rows.map(row => ({
      replyId: row.reply_id,
      opinionId: row.opinion_id,
      author: row.reply_author,
      text: row.reply_text,
      originalText: row.original_text,
      opinionTitle: row.opinion_title,
      line: row.line,
      ship: row.ship,
      createdAt: row.created_at
    })));
  } catch (error) {
    console.error('Unable to load user notifications:', error);
    return res.status(500).json({ error: '暫時無法載入通知，請稍後再試。' });
  }
});

// KLIKNIĘCIE POWIADOMIENIA OZNACZA WYŁĄCZNIE TĘ ODPOWIEDŹ JAKO PRZECZYTANĄ.
app.patch('/api/me/notifications/:id/read', requireUser, async (req, res) => {
  const replyId = Number(req.params.id);

  if (!Number.isInteger(replyId) || replyId <= 0) {
    return res.status(400).json({ error: '通知識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE comments AS reply
        SET reply_read_at = NOW()
        FROM comments AS parent
        WHERE reply.id = $1
          AND parent.id = reply.parent_comment_id
          AND parent.user_id = $2
          AND reply.user_id <> $2
        RETURNING reply.id
      `,
      [replyId, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則通知。' });
    }

    return res.json({ status: 'ok', id: result.rows[0].id });
  } catch (error) {
    console.error('Unable to mark user notification as read:', error);
    return res.status(500).json({ error: '暫時無法更新通知，請稍後再試。' });
  }
});

// OPINIE ZALOGOWANEGO UŻYTKOWNIKA — razem ze statusem moderacji.
app.get('/api/me/opinions', requireUser, async (req, res) => {
  try {
    await syncUserProfile(req.auth);

    const [result, statsResult] = await Promise.all([
      pool.query(
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
          WHERE user_id = $1 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
        `,
        [req.auth.userId]
      ),
      pool.query(
        `
          SELECT COUNT(*)::INTEGER AS approved_review_count
          FROM opinions
          WHERE user_id = $1
            AND status = 'approved'
            AND deleted_at IS NULL
        `,
        [req.auth.userId]
      )
    ]);

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

    const approvedReviewCount = Number(
      statsResult.rows[0]?.approved_review_count
    ) || 0;

    return res.json({
      opinions,
      approvedReviewCount,
      badge: reviewBadgeForCount(approvedReviewCount)
    });
  } catch (error) {
    console.error('Unable to load user opinions:', error);
    return res.status(500).json({
      error: '暫時無法載入你的評價，請稍後再試。'
    });
  }
});

// POJEDYNCZA WŁASNA OPINIA — używana do bezpiecznego wypełnienia formularza edycji.
app.get('/api/me/opinions/:id', requireUser, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
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
          status
        FROM opinions
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `,
      [id, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    const row = result.rows[0];
    return res.json({
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
      }
    });
  } catch (error) {
    console.error('Unable to load user opinion:', error);
    return res.status(500).json({
      error: '暫時無法載入這則評價，請稍後再試。'
    });
  }
});

// EDYCJA WŁASNEJ OPINII.
// Każda zmiana ponownie ustawia status pending, także dla opinii zatwierdzonej.
app.patch('/api/me/opinions/:id', requireUser, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  const opinion = opinionInputFromRequest(req);

  if (!opinionInputIsValid(opinion)) {
    return res.status(400).json({
      error: '請檢查所有欄位是否已正確填寫。'
    });
  }

  try {
    await syncUserProfile({
      ...req.auth,
      name: opinion.author
    });

    const result = await pool.query(
      `
        UPDATE opinions
        SET
          line = $1,
          ship = $2,
          cruise_date = $3,
          author = $4,
          title = $5,
          review_text = $6,
          rating_decor = $7,
          rating_room = $8,
          rating_service = $9,
          rating_food = $10,
          status = 'pending'
        WHERE id = $11 AND user_id = $12 AND deleted_at IS NULL
        RETURNING id, status
      `,
      [
        opinion.line,
        opinion.ship,
        opinion.date,
        opinion.author,
        opinion.title,
        opinion.text,
        opinion.ratings.decor,
        opinion.ratings.room,
        opinion.ratings.service,
        opinion.ratings.food,
        id,
        req.auth.userId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    return res.json({
      status: 'ok',
      id: result.rows[0].id,
      reviewStatus: result.rows[0].status
    });
  } catch (error) {
    console.error('Unable to update user opinion:', error);
    return res.status(500).json({
      error: '暫時無法更新評價，請稍後再試。'
    });
  }
});

// USUNIĘCIE WŁASNEJ OPINII — trafia do kosza, a user_id chroni cudze wpisy.
app.delete('/api/me/opinions/:id', requireUser, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: '評價識別碼不正確。' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE opinions
        SET deleted_at = NOW(), deleted_by = 'user'
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        RETURNING id, deleted_at
      `,
      [id, req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到這則評價。' });
    }

    return res.json({ status: 'ok', id: result.rows[0].id });
  } catch (error) {
    console.error('Unable to delete user opinion:', error);
    return res.status(500).json({
      error: '暫時無法刪除評價，請稍後再試。'
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
    const commentsResult = await client.query(
      'DELETE FROM comments WHERE user_id = $1',
      [req.auth.userId]
    );
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
      deletedComments: commentsResult.rowCount,
      deletedOpinions: opinionsResult.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    // Jeśli Neon usunął konto, ale zatwierdzenie transakcji nie powiodło się,
    // ponawiamy samo czyszczenie danych aplikacji bez wymagania tokenu użytkownika.
    if (authUserDeleted) {
      await pool.query('DELETE FROM comments WHERE user_id = $1', [req.auth.userId])
        .catch(cleanupError => console.error('Unable to finish comment cleanup:', cleanupError));
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
  const newOpinion = opinionInputFromRequest(req);

  if (!opinionInputIsValid(newOpinion)) {
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
      ALTER TABLE opinions
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE opinions
      ADD COLUMN IF NOT EXISTS deleted_by TEXT
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS opinions_user_id_index
      ON opinions (user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS opinions_deleted_at_index
      ON opinions (deleted_at)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id BIGSERIAL PRIMARY KEY,
        opinion_id INTEGER NOT NULL REFERENCES opinions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        parent_comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
        comment_text TEXT NOT NULL CHECK (
          CHAR_LENGTH(comment_text) BETWEEN 1 AND 1000
        ),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        edited_at TIMESTAMPTZ,
        admin_seen_at TIMESTAMPTZ,
        reply_read_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS admin_seen_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT
      REFERENCES comments(id) ON DELETE CASCADE
    `);
    await pool.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS reply_read_at TIMESTAMPTZ
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_opinion_id_index
      ON comments (opinion_id, created_at, id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_user_id_index
      ON comments (user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_created_at_index
      ON comments (created_at DESC, id DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_admin_unread_index
      ON comments (created_at DESC)
      WHERE admin_seen_at IS NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_parent_comment_id_index
      ON comments (parent_comment_id, created_at, id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS comments_unread_replies_index
      ON comments (parent_comment_id, created_at DESC)
      WHERE parent_comment_id IS NOT NULL AND reply_read_at IS NULL
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

module.exports = { app, pool, reviewBadgeForCount, startServer };
