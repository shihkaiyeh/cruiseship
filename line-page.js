(function () {
  const catalog = window.CRUISE_CATALOG;
  const params = new URLSearchParams(window.location.search);
  const company = catalog.getCompany(params.get('line'));
  const reviewsContainer = document.getElementById('reviews');

  if (!company) {
    document.title = '找不到郵輪公司｜郵輪評價誌';
    document.getElementById('lineHeader').hidden = true;

    const notFound = document.createElement('div');
    notFound.className = 'empty-reviews';
    notFound.innerHTML = `
      <h1 class="empty-reviews-title">找不到這家郵輪公司</h1>
      <p class="empty-reviews-text">它可能尚未加入目錄，或連結有誤。</p>
      <a class="add-button empty-reviews-button" href="add-review.html">新增評價</a>
    `;
    reviewsContainer.replaceChildren(notFound);
    return;
  }

  document.title = `${company.name} 評價｜郵輪評價誌`;
  document.getElementById('lineName').textContent = company.name;
  document.getElementById('addLineReview').href =
    `add-review.html?line=${encodeURIComponent(company.id)}`;

  window.ReviewsUI.loadReviews(
    opinion => catalog.normalize(opinion.line) === catalog.normalize(company.formValue),
    {
      emptyTitle: `目前還沒有關於 ${company.name} 的評價`,
      emptyText: '歡迎成為第一位分享搭乘體驗的旅客。',
      ctaHref: `add-review.html?line=${encodeURIComponent(company.id)}`,
      ctaText: '撰寫第一則評價'
    }
  );
})();
