(function () {
  const catalog = window.CRUISE_CATALOG;
  const params = new URLSearchParams(window.location.search);
  const group = params.get('group');
  const settings = {
    other: {
      title: '其他郵輪',
      eyebrow: 'More cruise lines',
      emptyTitle: '目前還沒有其他郵輪的評價'
    },
    river: {
      title: '河輪',
      eyebrow: 'River cruise reviews',
      emptyTitle: '目前還沒有河輪評價'
    }
  }[group];

  if (!settings) {
    window.location.replace('home.html');
    return;
  }

  const companies = catalog.getCompaniesByGroup(group);
  const filter = document.getElementById('companyFilter');
  let groupOpinions = [];

  document.title = `${settings.title}評價｜郵輪評價誌`;
  document.getElementById('groupName').textContent = settings.title;
  document.getElementById('groupEyebrow').textContent = settings.eyebrow;

  companies.forEach(company => {
    const option = document.createElement('option');
    option.value = company.id;
    option.textContent = company.name;
    filter.appendChild(option);
  });

  function renderSelectedCompany() {
    const selectedCompany = catalog.getCompany(filter.value);
    const opinions = selectedCompany
      ? groupOpinions.filter(opinion =>
          catalog.normalize(opinion.line) === catalog.normalize(selectedCompany.formValue)
        )
      : groupOpinions;

    window.ReviewsUI.renderReviews(opinions, {
      emptyTitle: selectedCompany
        ? `目前還沒有關於 ${selectedCompany.name} 的評價`
        : settings.emptyTitle,
      emptyText: '歡迎成為第一位分享搭乘體驗的旅客。',
      ctaHref: selectedCompany
        ? `add-review.html?line=${encodeURIComponent(selectedCompany.id)}`
        : 'add-review.html',
      ctaText: '撰寫第一則評價'
    });
  }

  filter.addEventListener('change', renderSelectedCompany);

  window.ReviewsUI.loadReviews(
    opinion => catalog.getGroupForLine(opinion.line) === group,
    {
      emptyTitle: settings.emptyTitle,
      emptyText: '歡迎成為第一位分享搭乘體驗的旅客。',
      ctaHref: 'add-review.html',
      ctaText: '撰寫第一則評價'
    }
  ).then(opinions => {
    groupOpinions = opinions;
    if (filter.value) {
      renderSelectedCompany();
    }
  });
})();
