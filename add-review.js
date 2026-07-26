const ships = {
  MSC: ['MSC Bellissima', 'MSC Virtuosa', 'MSC Seaside', 'MSC World Europa'],
  Costa: ['Costa Toscana', 'Costa Smeralda', 'Costa Deliziosa'],
  Disney: ['Disney Dream', 'Disney Fantasy', 'Disney Wish'],
  河輪: []
};

const lineSelect = document.getElementById('line');
const shipContainer = document.getElementById('ship-container');
const shipSelect = document.getElementById('ship');
const reviewForm = document.getElementById('reviewForm');

lineSelect.addEventListener('change', () => {
  const availableShips = ships[lineSelect.value] || [];
  const hasShips = availableShips.length > 0;

  shipContainer.hidden = !hasShips;
  shipSelect.disabled = !hasShips;
  shipSelect.replaceChildren();

  availableShips.forEach(ship => {
    const option = document.createElement('option');
    option.value = ship;
    option.textContent = ship;
    shipSelect.appendChild(option);
  });
});

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();

  const submitButton = document.getElementById('submitButton');
  const formMessage = document.getElementById('formMessage');
  const newOpinion = {
    title: document.getElementById('title').value.trim(),
    text: document.getElementById('text').value.trim(),
    line: lineSelect.value,
    ship: shipSelect.value,
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
    const response = await fetch('/add-opinion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOpinion)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '目前無法送出評價');
    }

    const params = new URLSearchParams({
      line: newOpinion.line,
      ship: newOpinion.ship
    });
    window.location.href = `thank-you.html?${params.toString()}`;
  } catch (error) {
    formMessage.textContent = error.message;
    submitButton.disabled = false;
    submitButton.textContent = '送出評價';
  }
});
