const catalog = window.CRUISE_CATALOG;
const lineInput = document.getElementById('line');
const lineOptions = document.getElementById('line-options');
const shipInput = document.getElementById('ship');
const shipOptions = document.getElementById('ship-options');
const reviewForm = document.getElementById('reviewForm');
const loginRequired = document.getElementById('reviewLoginRequired');
const loginLink = document.getElementById('reviewLoginLink');
const reviewLoadError = document.getElementById('reviewLoadError');
const routeSegments = window.CruiseRoutes.pathSegments();
const editReviewId = routeSegments[0] === 'edit-review'
  ? Number(routeSegments[1])
  : 0;
const isEditMode = Number.isInteger(editReviewId) && editReviewId > 0;
let selectedCompany;
let currentSession;

function option(value) {
  const element = document.createElement('option');
  element.value = value;
  return element;
}

function populateCompanies() {
  const menuOrder = { primary: 0, river: 1, other: 2 };
  const sortedCompanies = [...catalog.companies].sort((a, b) =>
    menuOrder[a.menuGroup] - menuOrder[b.menuGroup] ||
    a.name.localeCompare(b.name, 'zh-Hant')
  );

  lineOptions.replaceChildren(
    ...sortedCompanies.map(company => option(company.name))
  );
}

function populateShips(company, requestedShip = '') {
  selectedCompany = company;
  shipOptions.replaceChildren(
    ...company.ships.map(ship => option(ship.name))
  );
  shipInput.disabled = false;
  shipInput.placeholder = '輸入名稱或從清單選擇…';
  shipInput.value = '';

  const ship = catalog.getShip(requestedShip);
  if (ship?.companyId === company.id) {
    shipInput.value = ship.name;
  }
}

function clearShips() {
  selectedCompany = undefined;
  shipOptions.replaceChildren();
  shipInput.value = '';
  shipInput.disabled = true;
  shipInput.placeholder = '請先選擇郵輪公司';
}

function resolveCompanyInput() {
  const company = catalog.getCompany(lineInput.value);

  if (company) {
    lineInput.value = company.name;
    populateShips(company);
  } else {
    clearShips();
  }
}

lineInput.addEventListener('input', () => {
  const company = catalog.getCompany(lineInput.value);

  if (company && company.id !== selectedCompany?.id) {
    populateShips(company);
  } else if (!company) {
    clearShips();
  }
});

lineInput.addEventListener('change', resolveCompanyInput);

function applyQuerySelection() {
  const segments = routeSegments;
  const requestedLine = segments[0] === 'add-review' ? segments[1] || '' : '';
  const requestedShip = segments[0] === 'add-review' ? segments[2] || '' : '';
  const requestedShipData = catalog.getShip(requestedShip);
  const company = catalog.getCompany(requestedLine) ||
    catalog.getCompany(requestedShipData?.companyId);

  if (company) {
    lineInput.value = company.name;
    populateShips(company, requestedShip);
  }
}

function setEditModeCopy() {
  document.title = '編輯評價｜蜜拉士愷郵輪評價站';
  document.getElementById('reviewPageTitle').textContent = '編輯你的搭乘體驗';
  document.getElementById('reviewFormTitle').textContent = '編輯評價';
  document.getElementById('reviewFormLead').textContent = '儲存修改後，這則評價會重新送交管理員審核。';
  document.getElementById('editApprovalNotice').hidden = false;
  document.getElementById('submitButton').textContent = '儲存修改';
}

function fillEditForm(opinion) {
  const company = catalog.getCompany(opinion.line);
  const ship = catalog.getShip(opinion.ship);

  if (!company || !ship || ship.companyId !== company.id) {
    throw new Error('這則評價的郵輪資料不在目前的清單中。');
  }

  lineInput.value = company.name;
  populateShips(company, ship.name);
  document.getElementById('title').value = opinion.title || '';
  document.getElementById('text').value = opinion.text || '';
  document.getElementById('date').value = opinion.date || '';

  ['decor', 'room', 'service', 'food'].forEach(key => {
    const value = Number(opinion.ratings?.[key]);

    if (Number.isInteger(value) && value >= 1 && value <= 5) {
      document.getElementById(key).value = String(value);
    }
  });
}

function showEditLoadError(error) {
  reviewForm.hidden = true;
  loginRequired.hidden = true;
  reviewLoadError.hidden = false;
  document.getElementById('reviewLoadErrorText').textContent = error.message
    || '這則評價可能已被刪除，或不屬於你的帳號。';
}

async function loadOpinionForEditing() {
  const response = await window.CruiseAuth.authFetch(`/api/me/opinions/${editReviewId}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || '暫時無法載入這則評價，請稍後再試。');
    error.status = response.status;
    throw error;
  }

  setEditModeCopy();
  fillEditForm(data);
}

function selectedShip() {
  const ship = catalog.getShip(shipInput.value);
  return ship?.companyId === selectedCompany?.id ? ship : undefined;
}

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();

  const submitButton = document.getElementById('submitButton');
  const formMessage = document.getElementById('formMessage');
  const company = catalog.getCompany(lineInput.value);
  const ship = selectedShip();

  if (!company) {
    formMessage.textContent = '請從清單中選擇郵輪公司。';
    lineInput.focus();
    return;
  }

  if (!ship) {
    formMessage.textContent = '請從清單中選擇郵輪名稱。';
    shipInput.focus();
    return;
  }

  const newOpinion = {
    title: document.getElementById('title').value.trim(),
    text: document.getElementById('text').value.trim(),
    line: company.formValue,
    ship: ship.name,
    date: document.getElementById('date').value,
    ratings: {
      decor: Number(document.getElementById('decor').value),
      room: Number(document.getElementById('room').value),
      service: Number(document.getElementById('service').value),
      food: Number(document.getElementById('food').value)
    },
    author: document.getElementById('author').value.trim()
  };

  submitButton.disabled = true;
  submitButton.textContent = '送出中…';
  formMessage.textContent = '';

  try {
    const response = await window.CruiseAuth.authFetch(
      isEditMode ? `/api/me/opinions/${editReviewId}` : '/add-opinion',
      {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOpinion)
      }
    );
    const data = await response.json();

    if (!response.ok) {
      const responseError = new Error(data.error || '目前無法送出評價');
      responseError.status = response.status;
      throw responseError;
    }

    const thankYouUrl = window.CruiseRoutes.thankYouUrl(company, ship);
    window.location.href = isEditMode
      ? `${thankYouUrl}?updated=1`
      : thankYouUrl;
  } catch (error) {
    if (error.status === 401 || error.message === 'AUTH_REQUIRED') {
      window.location.href = loginLink.href;
      return;
    }

    formMessage.textContent = error.message || '目前無法送出評價';
    submitButton.disabled = false;
    submitButton.textContent = isEditMode ? '儲存修改' : '送出評價';
  }
});

async function initializeReviewForm() {
  populateCompanies();
  if (!isEditMode) {
    applyQuerySelection();
  }
  loginLink.href = `/account?returnTo=${encodeURIComponent(window.location.pathname)}`;

  try {
    currentSession = await window.CruiseAuth.getSession();
  } catch {
    currentSession = null;
  }

  if (!currentSession?.user) {
    loginRequired.hidden = false;
    reviewForm.hidden = true;
    return;
  }

  const authorInput = document.getElementById('author');
  authorInput.value = currentSession.user.name || '';
  authorInput.readOnly = Boolean(currentSession.user.name);
  loginRequired.hidden = true;

  if (routeSegments[0] === 'edit-review' && !isEditMode) {
    showEditLoadError(new Error('評價識別碼不正確。'));
    return;
  }

  if (isEditMode) {
    try {
      await loadOpinionForEditing();
    } catch (error) {
      if (error.status === 401 || error.message === 'AUTH_REQUIRED') {
        window.location.href = loginLink.href;
        return;
      }

      showEditLoadError(error);
      return;
    }
  }

  reviewLoadError.hidden = true;
  reviewForm.hidden = false;
}

initializeReviewForm();
