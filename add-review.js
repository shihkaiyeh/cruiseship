const catalog = window.CRUISE_CATALOG;
const lineInput = document.getElementById('line');
const lineOptions = document.getElementById('line-options');
const shipInput = document.getElementById('ship');
const shipOptions = document.getElementById('ship-options');
const reviewForm = document.getElementById('reviewForm');
const loginRequired = document.getElementById('reviewLoginRequired');
const loginLink = document.getElementById('reviewLoginLink');
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
  const segments = window.CruiseRoutes.pathSegments();
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
    const response = await window.CruiseAuth.authFetch('/add-opinion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOpinion)
    });
    const data = await response.json();

    if (!response.ok) {
      const responseError = new Error(data.error || '目前無法送出評價');
      responseError.status = response.status;
      throw responseError;
    }

    window.location.href = window.CruiseRoutes.thankYouUrl(company, ship);
  } catch (error) {
    if (error.status === 401 || error.message === 'AUTH_REQUIRED') {
      window.location.href = loginLink.href;
      return;
    }

    formMessage.textContent = error.message || '目前無法送出評價';
    submitButton.disabled = false;
    submitButton.textContent = '送出評價';
  }
});

async function initializeReviewForm() {
  populateCompanies();
  applyQuerySelection();
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
  reviewForm.hidden = false;
}

initializeReviewForm();
