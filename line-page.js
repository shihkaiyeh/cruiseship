(function () {
  const params = new URLSearchParams(window.location.search);
  const company = window.CRUISE_CATALOG.getCompany(params.get('line'));
  const fleetGrid = document.getElementById('fleetGrid');
  const reviewsContainer = document.getElementById('reviews');
  let reviewCounts = new Map();

  function renderFleet(query = '') {
    const normalizedQuery = window.CRUISE_CATALOG.normalize(query);
    const ships = company.ships.filter(ship =>
      window.CRUISE_CATALOG.normalize(ship.name).includes(normalizedQuery)
    );

    fleetGrid.replaceChildren();

    if (ships.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'catalog-empty';
      empty.textContent = company.ships.length
        ? '找不到符合的郵輪。'
        : '這家公司的船隻目錄正在整理中。';
      fleetGrid.appendChild(empty);
      return;
    }

    ships.forEach(ship => {
      const card = document.createElement('a');
      card.className = 'ship-card';
      card.href = `ship.html?ship=${encodeURIComponent(ship.slug)}`;

      const name = document.createElement('strong');
      name.textContent = ship.name;

      const count = document.createElement('span');
      const numberOfReviews = reviewCounts.get(window.CRUISE_CATALOG.normalize(ship.name)) || 0;
      count.textContent = numberOfReviews
        ? `${numberOfReviews} 則評價`
        : '尚無評價 · 歡迎成為第一位';

      card.append(name, count);

      if (ship.upcoming) {
        const badge = document.createElement('small');
        badge.className = 'ship-card-badge';
        badge.textContent = '即將推出';
        card.appendChild(badge);
      }

      fleetGrid.appendChild(card);
    });
  }

  if (!company) {
    document.title = '找不到郵輪公司｜郵輪評價誌';
    document.getElementById('lineHeader').hidden = true;
    document.querySelector('.fleet-section').hidden = true;

    const notFound = document.createElement('div');
    notFound.className = 'empty-reviews';
    notFound.innerHTML = `
      <h1 class="empty-reviews-title">找不到這家郵輪公司</h1>
      <p class="empty-reviews-text">它可能尚未加入目錄，或連結有誤。</p>
      <a class="add-button empty-reviews-button" href="add-review.html?missing=1">手動新增評價</a>
    `;
    reviewsContainer.replaceChildren(notFound);
    return;
  }

  document.title = `${company.name} 評價｜郵輪評價誌`;
  document.getElementById('lineName').textContent = company.name;
  document.getElementById('fleetHeading').textContent = `${company.name} 郵輪目錄`;
  document.getElementById('addLineReview').href =
    `add-review.html?line=${encodeURIComponent(company.id)}`;

  document.getElementById('fleetSearch').addEventListener('input', event => {
    renderFleet(event.currentTarget.value);
  });

  window.ReviewsUI.loadReviews(
    opinion => window.CRUISE_CATALOG.normalize(opinion.line) ===
      window.CRUISE_CATALOG.normalize(company.formValue),
    {
      emptyTitle: `目前還沒有關於 ${company.name} 的評價`,
      emptyText: '歡迎成為第一位分享搭乘體驗的旅客。',
      ctaHref: `add-review.html?line=${encodeURIComponent(company.id)}`,
      ctaText: '撰寫第一則評價'
    }
  ).then(opinions => {
    reviewCounts = opinions.reduce((counts, opinion) => {
      const key = window.CRUISE_CATALOG.normalize(opinion.ship);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    renderFleet();
  });
})();
