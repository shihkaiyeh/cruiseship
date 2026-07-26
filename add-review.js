const catalog = window.CRUISE_CATALOG;
const lineSelect = document.getElementById('line');
const shipContainer = document.getElementById('ship-container');
const shipSelect = document.getElementById('ship');
const customLineContainer = document.getElementById('custom-line-container');
const customLineInput = document.getElementById('custom-line');
const customShipContainer = document.getElementById('custom-ship-container');
const customShipInput = document.getElementById('custom-ship');
const reviewForm = document.getElementById('reviewForm');

function setCustomLineVisible(visible) {
  customLineContainer.hidden = !visible;
  customLineInput.required = visible;

  if (!visible) {
    customLineInput.value = '';
  }
}

function setCustomShipVisible(visible) {
  customShipContainer.hidden = !visible;
  customShipInput.required = visible;

  if (!visible) {
    customShipInput.value = '';
  }
}

function populateCompanies() {
  catalog.companies.forEach(company => {
    const option = document.createElement('option');
    option.value = company.id;
    option.textContent = company.name;
    lineSelect.appendChild(option);
  });

  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '找不到郵輪公司／手動輸入';
  lineSelect.appendChild(other);
}

function populateShips(company, selectedSlug = '') {
  shipSelect.replaceChildren();

  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = '請選擇';
  shipSelect.appendChild(prompt);

  company.ships.forEach(ship => {
    const option = document.createElement('option');
    option.value = ship.slug;
    option.textContent = ship.name;
    shipSelect.appendChild(option);
  });

  const other = document.createElement('option');
  other.value = '__other__';
  other.textContent = '找不到我的郵輪／手動輸入';
  shipSelect.appendChild(other);

  shipContainer.hidden = false;
  shipSelect.disabled = false;

  if (selectedSlug && catalog.getShip(selectedSlug)?.companyId === company.id) {
    shipSelect.value = selectedSlug;
  }
}

function handleLineChange(selectedShip = '') {
  const company = catalog.getCompany(lineSelect.value);
  const isOtherCompany = lineSelect.value === '__other__';

  setCustomLineVisible(isOtherCompany);
  setCustomShipVisible(isOtherCompany);

  if (isOtherCompany) {
    shipContainer.hidden = true;
    shipSelect.disabled = true;
    shipSelect.replaceChildren();
    return;
  }

  if (!company) {
    shipContainer.hidden = true;
    shipSelect.disabled = true;
    shipSelect.replaceChildren();
    setCustomShipVisible(false);
    return;
  }

  if (company.ships.length === 0) {
    shipContainer.hidden = true;
    shipSelect.disabled = true;
    shipSelect.replaceChildren();
    setCustomShipVisible(true);
    return;
  }

  populateShips(company, selectedShip);
  setCustomShipVisible(shipSelect.value === '__other__');
}

lineSelect.addEventListener('change', () => handleLineChange());

shipSelect.addEventListener('change', () => {
  setCustomShipVisible(shipSelect.value === '__other__');
});

function applyQuerySelection() {
  const params = new URLSearchParams(window.location.search);
  const requestedLine = params.get('line');
  const requestedShip = params.get('ship');
  const requestedShipData = catalog.getShip(requestedShip);

  if (params.get('missing') === '1') {
    lineSelect.value = '__other__';
    handleLineChange();
    customLineInput.focus();
    return;
  }

  const company = catalog.getCompany(requestedLine) ||
    catalog.getCompany(requestedShipData?.companyId);

  if (company) {
    lineSelect.value = company.id;
    handleLineChange(requestedShip);
  }
}

function selectedLineName() {
  if (lineSelect.value === '__other__') {
    return customLineInput.value.trim();
  }

  return catalog.getCompany(lineSelect.value)?.formValue || '';
}

function selectedShipName() {
  if (customShipInput.required) {
    return customShipInput.value.trim();
  }

  return catalog.getShip(shipSelect.value)?.name || '';
}

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();

  const submitButton = document.getElementById('submitButton');
  const formMessage = document.getElementById('formMessage');
  const newOpinion = {
    title: document.getElementById('title').value.trim(),
    text: document.getElementById('text').value.trim(),
    line: selectedLineName(),
    ship: selectedShipName(),
    date: document.getElementById('date').value,
    ratings: {
      decor: Number(document.getElementById('decor').value),
      room: Number(document.getElementById('room').value),
      service: Number(document.getElementById('service').value),
      food: Number(document.getElementById('food').value)
    },
    author: document.getElementById('author').value.trim()
  };

  if (!newOpinion.line || !newOpinion.ship) {
    formMessage.textContent = '請選擇或輸入郵輪公司與郵輪名稱。';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = '送出中…';
  formMessage.textContent = '';

  try {
    const response = await fetch('/add-opinion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOpinion)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '目前無法送出評價');
    }

    const knownShip = catalog.getShip(newOpinion.ship);
    const params = new URLSearchParams({
      line: catalog.getCompany(newOpinion.line)?.id || newOpinion.line,
      ship: knownShip?.slug || newOpinion.ship
    });
    window.location.href = `thank-you.html?${params.toString()}`;
  } catch (error) {
    formMessage.textContent = error.message;
    submitButton.disabled = false;
    submitButton.textContent = '送出評價';
  }
});

populateCompanies();
applyQuerySelection();
