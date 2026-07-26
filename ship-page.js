(function () {
  const params = new URLSearchParams(window.location.search);
  const ship = window.CRUISE_CATALOG.getShip(params.get('ship'));
  const reviewsContainer = document.getElementById('reviews');

  if (!ship) {
    document.title = '找不到郵輪｜郵輪評價誌';
    document.getElementById('shipHeader').hidden = true;

    const notFound = document.createElement('div');
    notFound.className = 'empty-reviews';
    notFound.innerHTML = `
      <h1 class="empty-reviews-title">找不到這艘郵輪</h1>
      <p class="empty-reviews-text">它可能尚未加入目錄，或連結有誤。</p>
      <a class="add-button empty-reviews-button" href="add-review.html?missing=1">手動新增評價</a>
    `;
    reviewsContainer.replaceChildren(notFound);
    return;
  }

  document.title = `${ship.name} 評價｜郵輪評價誌`;
  document.querySelector('meta[name="description"]').content =
    `${ship.name} 真實旅客評價：住宿、餐飲、服務與船上設施。`;

  const shipName = document.getElementById('shipName');
  const shipCompany = document.getElementById('shipCompany');
  const shipImage = document.getElementById('shipImage');
  const addReview = document.getElementById('addShipReview');
  const videoButton = document.getElementById('shipVideoButton');
  const videoSection = document.getElementById('videoSection');
  const videoFrame = document.getElementById('shipVideoFrame');
  const youtubeLink = document.getElementById('shipYoutubeLink');

  shipName.textContent = ship.name;
  shipCompany.textContent = ship.companyName;
  shipImage.src = ship.image;
  shipImage.alt = `${ship.name} 郵輪`;
  addReview.href = `add-review.html?line=${encodeURIComponent(ship.companyId)}&ship=${encodeURIComponent(ship.slug)}`;

  if (ship.youtubeVideoId) {
    const embedUrl =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ship.youtubeVideoId)}`;
    const youtubeUrl =
      `https://www.youtube.com/watch?v=${encodeURIComponent(ship.youtubeVideoId)}`;

    videoButton.hidden = false;
    youtubeLink.href = youtubeUrl;
    videoFrame.title = `${ship.name} 搭乘體驗影片`;

    videoButton.addEventListener('click', event => {
      event.preventDefault();
      videoSection.hidden = false;

      if (!videoFrame.getAttribute('src')) {
        videoFrame.src = embedUrl;
      }

      window.requestAnimationFrame(() => {
        videoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  window.ReviewsUI.loadReviews(
    opinion => window.CRUISE_CATALOG.normalize(opinion.ship) ===
      window.CRUISE_CATALOG.normalize(ship.name),
    {
      emptyTitle: `目前還沒有關於 ${ship.name} 的評價`,
      emptyText: '還沒有人分享搭乘體驗。你搭過這艘船嗎？歡迎成為第一位分享者！',
      ctaHref: addReview.href,
      ctaText: '撰寫第一則評價'
    }
  );
})();
