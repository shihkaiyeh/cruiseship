const loginView = document.getElementById('loginView');
const moderationView = document.getElementById('moderationView');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const moderationMessage = document.getElementById('moderationMessage');
const opinionsList = document.getElementById('opinionsList');
const logoutButton = document.getElementById('logoutButton');
const filterButtons = document.querySelectorAll('[data-filter]');
const adminViewButtons = document.querySelectorAll('[data-admin-view]');
const opinionsView = document.getElementById('opinionsView');
const commentsView = document.getElementById('commentsView');
const commentsList = document.getElementById('commentsList');
const commentsMessage = document.getElementById('commentsMessage');
const newCommentsBadge = document.getElementById('newCommentsBadge');
const refreshCommentsButton = document.getElementById('refreshCommentsButton');

let opinions = [];
let comments = [];
let currentFilter = 'pending';
let currentAdminView = 'opinions';

const statusLabels = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已拒絕',
  deleted: '已刪除'
};

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

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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
    const error = new Error(data.error || '發生錯誤，請稍後再試。');
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

  const activeOpinions = opinions.filter(opinion => !opinion.deleted_at);
  const visibleOpinions = currentFilter === 'deleted'
    ? opinions.filter(opinion => opinion.deleted_at)
    : currentFilter === 'all'
      ? activeOpinions
      : activeOpinions.filter(opinion => opinion.status === currentFilter);

  if (visibleOpinions.length === 0) {
    opinionsList.appendChild(
      textElement('p', 'empty-state', '此分類目前沒有評價。')
    );
    return;
  }

  visibleOpinions.forEach(opinion => {
    const card = document.createElement('article');
    card.className = 'opinion-card';

    const heading = document.createElement('div');
    heading.className = 'opinion-heading';
    heading.appendChild(textElement('h2', '', opinion.title));
    const visualStatus = opinion.deleted_at ? 'deleted' : opinion.status;
    heading.appendChild(
      textElement(
        'span',
        `status status-${visualStatus}`,
        statusLabels[visualStatus] || visualStatus
      )
    );
    card.appendChild(heading);

    card.appendChild(
      textElement('p', 'opinion-meta', `${opinion.line} · ${opinion.ship} · ${opinion.date}`)
    );

    if (!window.CRUISE_CATALOG.isKnownShip(opinion.line, opinion.ship)) {
      const catalogAlert = document.createElement('p');
      catalogAlert.className = 'catalog-alert';

      const companyIsKnown = Boolean(window.CRUISE_CATALOG.getCompany(opinion.line));
      catalogAlert.textContent = companyIsKnown
        ? '新郵輪：此船尚未加入郵輪目錄，請先確認名稱。'
        : '新郵輪公司與郵輪：尚未加入目錄，請先確認名稱。';
      card.appendChild(catalogAlert);
    }

    card.appendChild(textElement('p', 'opinion-author', `姓名：${opinion.author}`));
    card.appendChild(textElement('p', 'opinion-text', opinion.text));

    const ratings = document.createElement('div');
    ratings.className = 'ratings';
    ratings.appendChild(textElement('span', '', ratingText('裝潢', opinion.rating_decor)));
    ratings.appendChild(textElement('span', '', ratingText('房間', opinion.rating_room)));
    ratings.appendChild(textElement('span', '', ratingText('服務', opinion.rating_service)));
    ratings.appendChild(textElement('span', '', ratingText('餐飲', opinion.rating_food)));
    card.appendChild(ratings);

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (opinion.deleted_at) {
      const deletedNote = textElement(
        'p',
        'deleted-note',
        opinion.deleted_by === 'user'
          ? '由使用者刪除。你可以還原至待審核，或永久刪除。'
          : '由管理員移至回收桶。你可以還原至待審核，或永久刪除。'
      );
      card.appendChild(deletedNote);
      actions.appendChild(
        createActionButton('還原', 'restore-button', () => restoreOpinion(opinion.id))
      );
      actions.appendChild(
        createActionButton(
          '永久刪除',
          'delete-button',
          () => permanentlyDeleteOpinion(opinion.id, opinion.title)
        )
      );
    } else if (opinion.status !== 'approved') {
      actions.appendChild(
        createActionButton('通過', 'approve-button', () => updateOpinion(opinion.id, 'approved'))
      );
      if (opinion.status !== 'rejected') {
        actions.appendChild(
          createActionButton('拒絕', 'reject-button', () => updateOpinion(opinion.id, 'rejected'))
        );
      }
      actions.appendChild(
        createActionButton('刪除', 'delete-button', () => deleteOpinion(opinion.id, opinion.title))
      );
    } else {
      if (opinion.status !== 'rejected') {
        actions.appendChild(
          createActionButton('拒絕', 'reject-button', () => updateOpinion(opinion.id, 'rejected'))
        );
      }
      actions.appendChild(
        createActionButton('刪除', 'delete-button', () => deleteOpinion(opinion.id, opinion.title))
      );
    }

    card.appendChild(actions);
    opinionsList.appendChild(card);
  });
}

function renderComments() {
  commentsList.replaceChildren();

  if (comments.length === 0) {
    commentsList.appendChild(
      textElement('p', 'empty-state', '目前還沒有留言。')
    );
    return;
  }

  comments.forEach(comment => {
    const card = document.createElement('article');
    card.className = `comment-card${comment.isNew ? ' is-new' : ''}`;

    const heading = document.createElement('div');
    heading.className = 'comment-heading';
    heading.appendChild(textElement('strong', 'comment-author', comment.author || '郵輪旅人'));

    const headingMeta = document.createElement('div');
    headingMeta.className = 'comment-heading-meta';
    if (comment.isNew) {
      headingMeta.appendChild(textElement('span', 'comment-new-label', '待查看'));
    }
    headingMeta.appendChild(
      textElement('time', 'comment-date', formatDateTime(comment.createdAt))
    );
    heading.appendChild(headingMeta);
    card.appendChild(heading);

    const context = document.createElement('p');
    context.className = 'comment-context';
    context.appendChild(document.createTextNode('留言於「'));

    if (comment.opinionIsPublic) {
      const opinionLink = document.createElement('a');
      opinionLink.href = `/#review-${comment.opinionId}-comments`;
      opinionLink.target = '_blank';
      opinionLink.rel = 'noopener';
      opinionLink.textContent = comment.opinionTitle || '評價';
      context.appendChild(opinionLink);
    } else {
      context.appendChild(document.createTextNode(comment.opinionTitle || '評價'));
    }

    context.appendChild(
      document.createTextNode(`」 · ${comment.line || ''} · ${comment.ship || ''}`)
    );
    card.appendChild(context);

    const body = textElement('p', 'comment-text', comment.text || '');
    card.appendChild(body);

    if (comment.editedAt) {
      card.appendChild(
        textElement(
          'p',
          'comment-edited',
          `已編輯 · ${formatDateTime(comment.editedAt)}`
        )
      );
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (comment.opinionIsPublic) {
      const viewLink = document.createElement('a');
      viewLink.className = 'view-comment-link';
      viewLink.href = `/#review-${comment.opinionId}-comments`;
      viewLink.target = '_blank';
      viewLink.rel = 'noopener';
      viewLink.textContent = '在網站查看';
      actions.appendChild(viewLink);
    }

    actions.appendChild(
      createActionButton(
        '已查看',
        'seen-button',
        () => markCommentSeen(comment.id)
      )
    );
    card.appendChild(actions);
    commentsList.appendChild(card);
  });
}

function updateNewCommentsBadge(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  newCommentsBadge.textContent = safeCount > 99 ? '99+' : String(safeCount);
  newCommentsBadge.hidden = safeCount === 0;
  newCommentsBadge.parentElement.setAttribute(
    'aria-label',
    safeCount > 0 ? `留言，${safeCount} 則新留言` : '留言'
  );
}

async function loadNewCommentCount() {
  try {
    const data = await apiRequest('/api/admin/comments/unread-count');
    updateNewCommentsBadge(data.count);
  } catch (error) {
    if (error.status === 401) {
      loginView.hidden = false;
      moderationView.hidden = true;
    }
  }
}

async function loadComments() {
  commentsMessage.textContent = '正在載入留言…';

  try {
    comments = await apiRequest('/api/admin/comments');
    renderComments();
    commentsMessage.textContent = '';
    await loadNewCommentCount();
  } catch (error) {
    if (error.status === 401) {
      loginView.hidden = false;
      moderationView.hidden = true;
      return;
    }

    commentsMessage.textContent = error.message;
  }
}

async function markCommentSeen(id) {
  commentsMessage.textContent = '更新中…';

  try {
    await apiRequest('/api/admin/comments/seen', {
      method: 'PATCH',
      body: JSON.stringify({ ids: [id] })
    });
    await loadComments();
    commentsMessage.textContent = '已標記為已查看；留言仍保留在網站上。';
  } catch (error) {
    commentsMessage.textContent = error.message;
  }
}

async function loadOpinions() {
  try {
    opinions = await apiRequest('/api/admin/opinions');
    loginView.hidden = true;
    moderationView.hidden = false;
    moderationMessage.textContent = '';
    renderOpinions();
    await loadNewCommentCount();
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
    moderationMessage.textContent = '儲存中…';

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
  if (!window.confirm(`確定要刪除「${title}」這則評價嗎？\n評價會移至回收桶，之後仍可還原。`)) {
    return;
  }

  moderationMessage.textContent = '刪除中…';

  try {
    await apiRequest(`/api/admin/opinions/${id}`, {
      method: 'DELETE'
    });
    await loadOpinions();
  } catch (error) {
    moderationMessage.textContent = error.message;
  }
}

async function restoreOpinion(id) {
  moderationMessage.textContent = '還原中…';

  try {
    await apiRequest(`/api/admin/opinions/${id}/restore`, {
      method: 'PATCH'
    });
    await loadOpinions();
    moderationMessage.textContent = '評價已還原並移至待審核。';
  } catch (error) {
    moderationMessage.textContent = error.message;
  }
}

async function permanentlyDeleteOpinion(id, title) {
  if (!window.confirm(`確定要永久刪除「${title}」嗎？\n此操作無法復原。`)) {
    return;
  }

  moderationMessage.textContent = '永久刪除中…';

  try {
    await apiRequest(`/api/admin/opinions/${id}/permanent`, {
      method: 'DELETE'
    });
    await loadOpinions();
    moderationMessage.textContent = '評價已永久刪除。';
  } catch (error) {
    moderationMessage.textContent = error.message;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginMessage.textContent = '登入中…';

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
  comments = [];
  updateNewCommentsBadge(0);
  moderationView.hidden = true;
  loginView.hidden = false;
});

adminViewButtons.forEach(button => {
  button.addEventListener('click', async () => {
    currentAdminView = button.dataset.adminView;
    const showComments = currentAdminView === 'comments';

    adminViewButtons.forEach(viewButton => {
      viewButton.classList.toggle('active', viewButton === button);
    });
    opinionsView.hidden = showComments;
    commentsView.hidden = !showComments;

    if (showComments) {
      await loadComments();
    }
  });
});

refreshCommentsButton.addEventListener('click', loadComments);

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
