const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const submissionHistory = new Map();

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
          rating_food
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
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
      id: result.rows[0].id
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
