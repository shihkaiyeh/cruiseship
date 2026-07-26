const loginView = document.getElementById('loginView');
const moderationView = document.getElementById('moderationView');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const moderationMessage = document.getElementById('moderationMessage');
const opinionsList = document.getElementById('opinionsList');
const logoutButton = document.getElementById('logoutButton');
const filterButtons = document.querySelectorAll('[data-filter]');

let opinions = [];
let currentFilter = 'pending';

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function ratingText(label, value) {
  const rating = Number(value);
  return `${label}: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Wystąpił błąd.');
    error.status = response.status;
    throw error;
  }

  return data;
}

function createActionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderOpinions() {
  opinionsList.replaceChildren();

  const visibleOpinions = currentFilter === 'all'
    ? opinions
    : opinions.filter(opinion => opinion.status === currentFilter);

  if (visibleOpinions.length === 0) {
    opinionsList.appendChild(
      textElement('p', 'empty-state', 'Brak opinii w tej kategorii.')
    );
    return;
  }

  visibleOpinions.forEach(opinion => {
    const card = document.createElement('article');
    card.className = 'opinion-card';

    const heading = document.createElement('div');
    heading.className = 'opinion-heading';
    heading.appendChild(textElement('h2', '', opinion.title));
    heading.appendChild(textElement('span', `status status-${opinion.status}`, opinion.status));
    card.appendChild(heading);

    card.appendChild(
      textElement('p', 'opinion-meta', `${opinion.line} · ${opinion.ship} · ${opinion.date}`)
    );
    card.appendChild(textElement('p', 'opinion-author', `Autor: ${opinion.author}`));
    card.appendChild(textElement('p', 'opinion-text', opinion.text));

    const ratings = document.createElement('div');
    ratings.className = 'ratings';
    ratings.appendChild(textElement('span', '', ratingText('Wystrój', opinion.rating_decor)));
    ratings.appendChild(textElement('span', '', ratingText('Pokój', opinion.rating_room)));
    ratings.appendChild(textElement('span', '', ratingText('Obsługa', opinion.rating_service)));
    ratings.appendChild(textElement('span', '', ratingText('Jedzenie', opinion.rating_food)));
    card.appendChild(ratings);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (opinion.status !== 'approved') {
      actions.appendChild(
        createActionButton('Zatwierdź', 'approve-button', () => updateOpinion(opinion.id, 'approved'))
      );
    }

    if (opinion.status !== 'rejected') {
      actions.appendChild(
        createActionButton('Odrzuć', 'reject-button', () => updateOpinion(opinion.id, 'rejected'))
      );
    }

    actions.appendChild(
      createActionButton('Usuń', 'delete-button', () => deleteOpinion(opinion.id, opinion.title))
    );

    card.appendChild(actions);
    opinionsList.appendChild(card);
  });
}

async function loadOpinions() {
  try {
    opinions = await apiRequest('/api/admin/opinions');
    loginView.hidden = true;
    moderationView.hidden = false;
    moderationMessage.textContent = '';
    renderOpinions();
  } catch (error) {
    if (error.status === 401) {
      loginView.hidden = false;
      moderationView.hidden = true;
      return;
    }

    moderationMessage.textContent = error.message;
  }
}

async function updateOpinion(id, status) {
  moderationMessage.textContent = 'Zapisywanie…';

  try {
    await apiRequest(`/api/admin/opinions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await loadOpinions();
  } catch (error) {
    moderationMessage.textContent = error.message;
  }
}

async function deleteOpinion(id, title) {
  if (!window.confirm(`Usunąć opinię „${title}”? Tej operacji nie można cofnąć.`)) {
    return;
  }

  moderationMessage.textContent = 'Usuwanie…';

  try {
    await apiRequest(`/api/admin/opinions/${id}`, {
      method: 'DELETE'
    });
    await loadOpinions();
  } catch (error) {
    moderationMessage.textContent = error.message;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = 'Logowanie…';

  try {
    await apiRequest('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        password: document.getElementById('password').value
      })
    });

    loginForm.reset();
    loginMessage.textContent = '';
    await loadOpinions();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  await apiRequest('/api/admin/logout', { method: 'POST' });
  opinions = [];
  moderationView.hidden = true;
  loginView.hidden = false;
});

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;

    filterButtons.forEach(filterButton => {
      filterButton.classList.toggle('active', filterButton === button);
    });

    renderOpinions();
  });
});

loadOpinions();
