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

function createUserBadge(badge, approvedReviewCount) {
  if (!badge?.key || !badge?.label) {
    return null;
  }

  const element = createTextElement(
    'span',
    `user-badge user-badge-${badge.key}`,
    badge.label
  );
  const count = Number(approvedReviewCount) || 0;
  element.title = `已通過 ${count} 則評價`;
  element.setAttribute('aria-label', `${badge.label}，已通過 ${count} 則評價`);
  return element;
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

  review.appendChild(createTextElement('div', 'review-section-title', '旅客心得'));

  const reviewText = createTextElement('p', 'review-text', opinion.text || '');
  review.appendChild(reviewText);

  if ((opinion.text || '').length > 180) {
    reviewText.classList.add('is-collapsed');

    const toggleTextButton = document.createElement('button');
    toggleTextButton.type = 'button';
    toggleTextButton.className = 'review-text-toggle';
    toggleTextButton.textContent = '顯示更多';
    toggleTextButton.setAttribute('aria-expanded', 'false');

    toggleTextButton.addEventListener('click', () => {
      const isExpanded = toggleTextButton.getAttribute('aria-expanded') === 'true';
      reviewText.classList.toggle('is-collapsed', isExpanded);
      toggleTextButton.setAttribute('aria-expanded', String(!isExpanded));
      toggleTextButton.textContent = isExpanded ? '顯示更多' : '收起';
    });

    review.appendChild(toggleTextButton);
  }

  const author = document.createElement('div');
  author.className = 'review-author';
  author.appendChild(
    createTextElement('span', 'review-author-name', `分享者：${opinion.author || ''}`)
  );

  const userBadge = createUserBadge(opinion.badge, opinion.approvedReviewCount);
  if (userBadge) {
    author.appendChild(userBadge);
  }

  review.appendChild(author);

  return review;
}

function updateRatingSummary(opinions) {
  const averageElement = document.querySelector('[data-rating-average]');
  const starsElement = document.querySelector('[data-rating-stars]');
  const countElement = document.querySelector('[data-rating-count]');

  if (!averageElement || !starsElement || !countElement) {
    return;
  }

  const ratings = opinions.flatMap(opinion => [
    opinion.ratings?.decor,
    opinion.ratings?.room,
    opinion.ratings?.service,
    opinion.ratings?.food
  ]).map(Number).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);

  if (opinions.length === 0 || ratings.length === 0) {
    averageElement.textContent = '—';
    starsElement.style.setProperty('--rating-fill', '0%');
    countElement.textContent = '目前還沒有評價';
    return;
  }

  const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  averageElement.textContent = average.toFixed(1);
  starsElement.style.setProperty('--rating-fill', `${(average / 5) * 100}%`);
  countElement.textContent = `${opinions.length} 則評價`;
}

function createEmptyReviews(options = {}) {
  const empty = document.createElement('div');
  empty.className = 'empty-reviews';

  const title = createTextElement(
    'h3',
    'empty-reviews-title',
    options.emptyTitle || '目前還沒有評價'
  );
  const text = createTextElement(
    'p',
    'empty-reviews-text',
    options.emptyText || '還沒有人分享搭乘體驗。'
  );
  empty.append(title, text);

  if (options.ctaHref) {
    const link = document.createElement('a');
    link.className = 'add-button empty-reviews-button';
    link.href = options.ctaHref;
    link.textContent = options.ctaText || '撰寫第一則評價';
    empty.appendChild(link);
  }

  return empty;
}

function renderReviews(opinions, options = {}) {
  const container = document.getElementById('reviews');
  container.replaceChildren();
  updateRatingSummary(opinions);

  if (opinions.length === 0) {
    container.appendChild(createEmptyReviews(options));
    return;
  }

  opinions.forEach(opinion => {
    container.appendChild(createReviewCard(opinion));
  });
}

async function loadReviews(filter, options = {}) {
  const container = document.getElementById('reviews');

  try {
    const response = await fetch('/api/opinions');

    if (!response.ok) {
      throw new Error('無法載入評價');
    }

    const opinions = await response.json();
    const filteredOpinions = opinions.filter(filter);

    renderReviews(filteredOpinions, options);
    return filteredOpinions;
  } catch (error) {
    updateRatingSummary([]);
    container.replaceChildren(
      createTextElement('p', 'reviews-error', '暫時無法載入評價，請稍後再試。')
    );
    return [];
  }
}

window.ReviewsUI = {
  loadReviews,
  renderReviews,
  updateRatingSummary
};
