const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const opinionsPath = path.join(__dirname, 'opinions.json');
const submissionHistory = new Map();

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

// ZAPISYWANIE OPINII
app.post('/add-opinion', (req, res) => {
  if (!canSubmit(req.ip)) {
    return res.status(429).json({
      error: '已超過每小時可提交的評價數量，請稍後再試。'
    });
  }

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

  try {
    const data = JSON.parse(
      fs.readFileSync(opinionsPath, 'utf8')
    );

    data.push(newOpinion);

    fs.writeFileSync(
      opinionsPath,
      JSON.stringify(data, null, 2)
    );

    return res.status(201).json({ status: 'ok' });
  } catch (error) {
    console.error('Unable to save opinion:', error);
    return res.status(500).json({
      error: '暫時無法保存評價，請稍後再試。'
    });
  }
});

// URUCHOMIENIE SERWERA
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
