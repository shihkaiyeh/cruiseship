function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createRating(label, value) {
  const safeValue = Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : 0;

  return createTextElement(
    'div',
    '',
    `${label}: ${'★'.repeat(safeValue)}${'☆'.repeat(5 - safeValue)}`
  );
}

function createReviewCard(opinion) {
  const review = document.createElement('article');
  review.className = 'review';

  review.appendChild(createTextElement('h3', '', opinion.title || ''));

  const header = document.createElement('div');
  header.className = 'review-header';
  header.appendChild(createTextElement('span', '', `郵輪: ${opinion.ship || ''}`));
  header.appendChild(createTextElement('span', '', `搭船日期: ${opinion.date || ''}`));
  review.appendChild(header);

  const ratings = document.createElement('div');
  ratings.className = 'review-ratings';
  ratings.appendChild(createRating('裝潢', opinion.ratings?.decor));
  ratings.appendChild(createRating('服務', opinion.ratings?.service));
  ratings.appendChild(createRating('房間', opinion.ratings?.room));
  ratings.appendChild(createRating('食物', opinion.ratings?.food));
  review.appendChild(ratings);

  review.appendChild(createTextElement('div', 'review-section-title', '評價:'));
  review.appendChild(createTextElement('p', 'review-text', opinion.text || ''));
  review.appendChild(createTextElement('div', 'review-author', `名字: ${opinion.author || ''}`));

  return review;
}

async function loadReviews(filter) {
  const container = document.getElementById('reviews');

  try {
    const response = await fetch('/opinions.json');

    if (!response.ok) {
      throw new Error('無法載入評價');
    }

    const opinions = await response.json();
    const filteredOpinions = opinions.filter(filter);

    container.replaceChildren();

    if (filteredOpinions.length === 0) {
      container.appendChild(
        createTextElement('p', 'empty-reviews', '目前還沒有評價。')
      );
      return;
    }

    filteredOpinions.forEach(opinion => {
      container.appendChild(createReviewCard(opinion));
    });
  } catch (error) {
    container.replaceChildren(
      createTextElement('p', 'reviews-error', '暫時無法載入評價，請稍後再試。')
    );
  }
}
