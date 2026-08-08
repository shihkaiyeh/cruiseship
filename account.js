(function () {
  const auth = window.CruiseAuth;
  const loading = document.getElementById('accountLoading');
  const guest = document.getElementById('guestAccount');
  const profile = document.getElementById('loggedInAccount');
  const deletedPanel = document.getElementById('accountDeletedPanel');
  const message = document.getElementById('authMessage');
  const tabs = [...document.querySelectorAll('[data-auth-panel]')];
  const forms = [...document.querySelectorAll('[data-auth-form]')];
  const reviewsLoading = document.getElementById('accountReviewsLoading');
  const reviewsMessage = document.getElementById('accountReviewsMessage');
  const reviewsList = document.getElementById('accountReviewsList');
  const reviewsEmpty = document.getElementById('accountReviewsEmpty');
  const notificationsLoading = document.getElementById('accountNotificationsLoading');
  const notificationsList = document.getElementById('accountNotificationsList');
  const notificationsEmpty = document.getElementById('accountNotificationsEmpty');
  const notificationsCount = document.getElementById('accountNotificationsCount');
  const accountBadge = document.getElementById('accountBadge');
  const accountBadgeProgress = document.getElementById('accountBadgeProgress');
  const badgeAchievement = document.getElementById('badgeAchievement');
  const badgeAchievementTitle = document.getElementById('badgeAchievementTitle');
  const badgeAchievementClose = document.getElementById('badgeAchievementClose');
  const termsVersion = '2026-08-01';
  const pendingTermsKey = 'cruisePendingTermsAcceptance';
  const accountDeleted = new URLSearchParams(window.location.search).get('deleted') === '1';
  const returnPath = auth.safeReturnPath(
    new URLSearchParams(window.location.search).get('returnTo'),
    '/account'
  );
  let verificationEmail = sessionStorage.getItem('cruiseVerificationEmail') || '';
  let resetEmail = '';
  let seenBadgeStorageKey = '';

  const statusLabels = {
    pending: {
      label: '待審核',
      note: '管理員審核後就會顯示在網站上。'
    },
    approved: {
      label: '已通過',
      note: '這則評價已經公開。'
    },
    rejected: {
      label: '已拒絕',
      note: '這則評價不會顯示在網站上。'
    }
  };

  function setMessage(text = '', type = 'error') {
    message.textContent = text;
    message.classList.toggle('success', type === 'success');
  }

  function signInFailureMessage(error) {
    const text = auth.friendlyMessage(error);

    if (
      text === '電子信箱或密碼不正確。' ||
      text === '目前無法完成操作，請稍後再試。'
    ) {
      return '找不到這個帳號。請先申請帳號。';
    }

    return text;
  }

  function setFormBusy(form, isBusy) {
    form.querySelectorAll('button, input').forEach(control => {
      control.disabled = isBusy;
    });
  }

  function showPanel(panelName) {
    guest.hidden = false;
    profile.hidden = true;
    deletedPanel.hidden = true;
    loading.hidden = true;
    setMessage('');

    forms.forEach(form => {
      form.hidden = form.dataset.authForm !== panelName;
    });

    tabs.forEach(tab => {
      const active = tab.dataset.authPanel === panelName;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    document.querySelector('.auth-tabs').hidden = !['login', 'signup'].includes(panelName);

    if (panelName === 'verify') {
      document.getElementById('verificationEmail').textContent = verificationEmail;
      document.getElementById('verificationCode').focus();
    }

    if (panelName === 'reset') {
      document.getElementById('resetEmailLabel').textContent = resetEmail;
      document.getElementById('resetCode').focus();
    }
  }

  function showProfile(session) {
    const user = session.user;
    const displayName = user.name || '郵輪旅人';
    const userIdentity = user.id || user.email || '';
    seenBadgeStorageKey = userIdentity
      ? `cruiseSeenBadge:${userIdentity}`
      : '';
    loading.hidden = true;
    guest.hidden = true;
    profile.hidden = false;
    deletedPanel.hidden = true;
    document.getElementById('accountName').textContent = displayName;
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountInitial').textContent = displayName.trim().charAt(0) || '航';
    document.getElementById('profileNameInput').value = displayName;
    setAccountBadge(null, 0);
    setMessage('');
  }

  function showDeletedPanel() {
    forms.forEach(form => form.reset());
    loading.hidden = true;
    guest.hidden = true;
    profile.hidden = true;
    deletedPanel.hidden = false;
    setMessage('');
  }

  function createElement(tagName, className = '', text = '') {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
  }

  function setAccountBadge(badge, approvedReviewCount) {
    const count = Number(approvedReviewCount) || 0;

    accountBadge.className = 'user-badge';
    accountBadge.textContent = '';
    accountBadge.hidden = !badge?.key || !badge?.label;

    if (badge?.key && badge?.label) {
      accountBadge.classList.add(`user-badge-${badge.key}`);
      accountBadge.textContent = badge.label;
      accountBadge.title = `已通過 ${count} 則評價`;
    }

    accountBadgeProgress.textContent = count > 0
      ? `已通過 ${count} 則評價`
      : '通過第一則評價後就會獲得第一枚徽章。';
    accountBadgeProgress.hidden = false;

    if (!badge?.key || !badge?.label || !seenBadgeStorageKey) {
      badgeAchievement.hidden = true;
      return;
    }

    const lastSeenBadge = localStorage.getItem(seenBadgeStorageKey);
    if (lastSeenBadge !== badge.key) {
      badgeAchievementTitle.textContent = `恭喜！你獲得「${badge.label}」徽章！`;
      badgeAchievement.hidden = false;
      localStorage.setItem(seenBadgeStorageKey, badge.key);
    } else {
      badgeAchievement.hidden = true;
    }
  }

  function averageRating(ratings = {}) {
    const values = ['decor', 'room', 'service', 'food']
      .map(key => Number(ratings[key]))
      .filter(value => Number.isFinite(value));

    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function reviewPublicUrl(opinion) {
    const ship = window.CRUISE_CATALOG?.getShip(opinion.ship);

    if (ship) {
      return window.CruiseRoutes.shipUrl(ship);
    }

    const company = window.CRUISE_CATALOG?.getCompany(opinion.line);
    return company ? window.CruiseRoutes.lineUrl(company) : '/';
  }

  function formatNotificationDate(value) {
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

  function notificationPublicUrl(notification) {
    const baseUrl = reviewPublicUrl(notification);
    const commentId = notification.commentId || notification.replyId;
    return `${baseUrl}#review-${notification.opinionId}-comment-${commentId}`;
  }

  function renderNotification(notification) {
    const isReply = notification.type !== 'comment';
    const notificationId = notification.id || notification.commentId || notification.replyId;
    const targetUrl = notificationPublicUrl(notification);
    const card = createElement('a', 'account-notification-card');
    card.href = targetUrl;

    const heading = createElement('div', 'account-notification-heading');
    heading.append(
      createElement(
        'strong',
        '',
        isReply
          ? `${notification.author || '郵輪旅人'} 回覆了你的留言`
          : `${notification.author || '郵輪旅人'} 在你的評價下留言`
      ),
      createElement('time', '', formatNotificationDate(notification.createdAt))
    );

    const context = createElement(
      'p',
      'account-notification-context',
      `評價：${notification.opinionTitle || '未命名評價'}`
    );
    const reply = createElement(
      'p',
      'account-notification-reply',
      notification.text || ''
    );
    const action = createElement(
      'span',
      'account-notification-action',
      isReply ? '查看回覆 →' : '查看留言 →'
    );
    card.append(heading, context, reply);

    if (isReply) {
      card.append(createElement(
        'p',
        'account-notification-original',
        `你的留言：${notification.originalText || ''}`
      ));
    }

    card.append(action);

    card.addEventListener('click', async event => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (typeof event.button === 'number' && event.button !== 0)
      ) {
        return;
      }

      event.preventDefault();
      card.classList.add('is-opening');
      action.textContent = '正在開啟…';

      try {
        await auth.authFetch(`/api/me/notifications/${notificationId}/read`, {
          method: 'PATCH'
        });
      } catch (error) {
        console.error('Unable to mark notification as read:', error);
      } finally {
        window.location.href = targetUrl;
      }
    });

    return card;
  }

  function showNotificationsError(text) {
    notificationsLoading.hidden = false;
    notificationsLoading.textContent = text;
    notificationsLoading.classList.add('error');
    notificationsList.hidden = true;
    notificationsEmpty.hidden = true;
    notificationsCount.hidden = true;
  }

  async function loadNotifications() {
    notificationsLoading.hidden = false;
    notificationsLoading.textContent = '正在載入通知…';
    notificationsLoading.classList.remove('error');
    notificationsList.hidden = true;
    notificationsEmpty.hidden = true;

    try {
      const response = await auth.authFetch('/api/me/notifications');
      const data = await response.json().catch(() => []);

      if (!response.ok) {
        throw new Error(data.error || 'NOTIFICATIONS_UNAVAILABLE');
      }

      const notifications = Array.isArray(data) ? data : [];
      notificationsList.replaceChildren(...notifications.map(renderNotification));
      notificationsCount.textContent = String(notifications.length);
      notificationsCount.hidden = notifications.length === 0;
      notificationsLoading.hidden = true;
      notificationsList.hidden = notifications.length === 0;
      notificationsEmpty.hidden = notifications.length !== 0;
    } catch (error) {
      console.error('Unable to load account notifications:', error);
      showNotificationsError('暫時無法載入通知，請稍後再試。');
    }
  }

  function showReviewsMessage(text = '', type = 'success') {
    reviewsMessage.textContent = text;
    reviewsMessage.classList.toggle('error', type === 'error');
    reviewsMessage.hidden = !text;
  }

  async function deleteOpinion(opinion, button) {
    const title = opinion.title || '未命名評價';
    const confirmed = window.confirm(
      `確定要刪除「${title}」嗎？\n刪除後將不再顯示；如需還原，請聯絡管理員。`
    );

    if (!confirmed) {
      return;
    }

    button.disabled = true;
    button.textContent = '刪除中…';
    showReviewsMessage('');

    try {
      const response = await auth.authFetch(`/api/me/opinions/${opinion.id}`, {
        method: 'DELETE'
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || '暫時無法刪除評價，請稍後再試。');
      }

      await loadMyOpinions();
      showReviewsMessage('評價已刪除。');
    } catch (error) {
      console.error('Unable to delete opinion:', error);
      showReviewsMessage(
        error.message || '暫時無法刪除評價，請稍後再試。',
        'error'
      );
      button.disabled = false;
      button.textContent = '刪除評價';
    }
  }

  function renderOpinion(opinion) {
    const statusKey = statusLabels[opinion.status] ? opinion.status : 'pending';
    const status = statusLabels[statusKey];
    const card = createElement('article', 'account-review-card');

    const heading = createElement('div', 'account-review-heading');
    const title = createElement('h4', '', opinion.title || '未命名評價');
    const badge = createElement('span', `account-status account-status-${statusKey}`, status.label);
    heading.append(title, badge);

    const meta = createElement('div', 'account-review-meta');
    meta.append(
      createElement('span', '', `郵輪：${opinion.ship || '—'}`),
      createElement('span', '', `搭船日期：${opinion.date || '—'}`)
    );

    const excerpt = createElement('p', 'account-review-excerpt', opinion.text || '');
    const footer = createElement('div', 'account-review-footer');
    const rating = averageRating(opinion.ratings);
    const score = createElement(
      'span',
      'account-review-score',
      rating ? `${rating.toFixed(1)} ★` : '尚無評分'
    );
    const statusNote = createElement('span', 'account-review-status-note', status.note);
    footer.append(score, statusNote);

    if (statusKey === 'approved') {
      const link = createElement('a', 'account-review-link', '查看公開評價');
      link.href = reviewPublicUrl(opinion);
      footer.appendChild(link);
    }

    const actions = createElement('div', 'account-review-actions');
    const editLink = createElement('a', 'account-review-action account-review-edit', '編輯評價');
    editLink.href = `/edit-review/${encodeURIComponent(opinion.id)}`;

    const deleteButton = createElement(
      'button',
      'account-review-action account-review-delete',
      '刪除評價'
    );
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => deleteOpinion(opinion, deleteButton));
    actions.append(editLink, deleteButton);
    footer.appendChild(actions);

    card.append(heading, meta, excerpt, footer);
    return card;
  }

  function showReviewsError(text) {
    reviewsLoading.hidden = false;
    reviewsLoading.textContent = text;
    reviewsLoading.classList.add('error');
    reviewsList.hidden = true;
    reviewsEmpty.hidden = true;
  }

  async function loadMyOpinions() {
    reviewsLoading.hidden = false;
    reviewsLoading.textContent = '正在載入你的評價…';
    reviewsLoading.classList.remove('error');
    reviewsList.hidden = true;
    reviewsEmpty.hidden = true;

    try {
      const response = await auth.authFetch('/api/me/opinions');
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'REVIEWS_UNAVAILABLE');
      }

      const opinions = Array.isArray(data) ? data : (data.opinions || []);
      setAccountBadge(
        Array.isArray(data) ? null : data.badge,
        Array.isArray(data) ? 0 : data.approvedReviewCount
      );
      reviewsList.replaceChildren(...opinions.map(renderOpinion));
      reviewsLoading.hidden = true;
      reviewsList.hidden = opinions.length === 0;
      reviewsEmpty.hidden = opinions.length !== 0;
    } catch (error) {
      console.error('Unable to load account opinions:', error);
      showReviewsError('暫時無法載入你的評價，請稍後再試。');
    }
  }

  async function activateProfile(session) {
    showProfile(session);
    await Promise.all([loadNotifications(), loadMyOpinions()]);
  }

  async function savePendingTermsAcceptance() {
    if (localStorage.getItem(pendingTermsKey) !== termsVersion) {
      return;
    }

    try {
      const response = await auth.authFetch('/api/me/terms-acceptance', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('TERMS_ACCEPTANCE_FAILED');
      }

      localStorage.removeItem(pendingTermsKey);
    } catch (error) {
      console.error('Unable to save terms acceptance:', error);
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.authPanel));
  });

  badgeAchievementClose.addEventListener('click', () => {
    badgeAchievement.hidden = true;
  });

  document.querySelectorAll('[data-show-panel]').forEach(button => {
    button.addEventListener('click', () => showPanel(button.dataset.showPanel));
  });

  document.getElementById('createAccountAfterDelete').addEventListener('click', () => {
    window.history.replaceState({}, '', '/account');
    showPanel('signup');
    document.getElementById('signupName').focus();
  });

  document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setFormBusy(form, true);
    setMessage('');

    try {
      await auth.signIn({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });

      await savePendingTermsAcceptance();

      if (returnPath !== '/account') {
        window.location.href = returnPath;
        return;
      }

      const session = await auth.getSession();
      await activateProfile(session);
    } catch (error) {
      setMessage(signInFailureMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const acceptedTerms = document.getElementById('signupTerms').checked;

    if (password !== passwordConfirm) {
      setMessage('兩次輸入的密碼不一致。');
      return;
    }

    if (!acceptedTerms) {
      setMessage('請先閱讀並同意隱私權政策與使用條款。');
      return;
    }

    setFormBusy(form, true);
    setMessage('');

    try {
      verificationEmail = document.getElementById('signupEmail').value.trim();
      await auth.signUp({
        name: document.getElementById('signupName').value.trim(),
        email: verificationEmail,
        password
      });
      localStorage.setItem(pendingTermsKey, termsVersion);
      sessionStorage.setItem('cruiseVerificationEmail', verificationEmail);
      showPanel('verify');
      setMessage('驗證碼已寄出，請查看電子郵件。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('verifyForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setFormBusy(form, true);
    setMessage('');

    try {
      await auth.verifyEmail({
        email: verificationEmail,
        otp: document.getElementById('verificationCode').value.trim()
      });
      sessionStorage.removeItem('cruiseVerificationEmail');

      const session = await auth.getSession();
      if (session?.user) {
        await savePendingTermsAcceptance();
        if (returnPath !== '/account') {
          window.location.href = returnPath;
          return;
        }
        await activateProfile(session);
      } else {
        showPanel('login');
        document.getElementById('loginEmail').value = verificationEmail;
        setMessage('電子信箱驗證成功，現在可以登入。', 'success');
      }
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('resendCode').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    setMessage('');

    try {
      await auth.resendVerificationCode(verificationEmail);
      setMessage('新的驗證碼已寄出。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('forgotForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setFormBusy(form, true);
    setMessage('');

    try {
      resetEmail = document.getElementById('forgotEmail').value.trim();
      await auth.requestPasswordReset(resetEmail);
      showPanel('reset');
      setMessage('重設密碼驗證碼已寄出。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('resetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = document.getElementById('resetPassword').value;
    const passwordConfirm = document.getElementById('resetPasswordConfirm').value;

    if (password !== passwordConfirm) {
      setMessage('兩次輸入的新密碼不一致。');
      return;
    }

    setFormBusy(form, true);
    setMessage('');

    try {
      await auth.resetPassword({
        email: resetEmail,
        otp: document.getElementById('resetCode').value.trim(),
        password
      });
      showPanel('login');
      document.getElementById('loginEmail').value = resetEmail;
      setMessage('密碼已更新，現在可以登入。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('profileNameForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = document.getElementById('profileNameInput');
    const displayName = input.value.trim();

    if (displayName.length < 2 || displayName.length > 30) {
      setMessage('顯示名稱需要 2 到 30 個字元。');
      return;
    }

    setFormBusy(form, true);
    setMessage('');

    try {
      await auth.updateName(displayName);
      const response = await auth.authFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'PROFILE_UPDATE_FAILED');
      }

      document.getElementById('accountName').textContent = displayName;
      document.getElementById('accountInitial').textContent = displayName.charAt(0) || '航';
      setMessage('顯示名稱已更新，所有評價也會顯示新名稱。', 'success');
    } catch (error) {
      const text = error.message && /[\u3400-\u9FFF]/u.test(error.message)
        ? error.message
        : auth.friendlyMessage(error);
      setMessage(text);
    } finally {
      setFormBusy(form, false);
    }
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newAccountPassword').value;
    const passwordConfirm = document.getElementById('newAccountPasswordConfirm').value;

    if (newPassword !== passwordConfirm) {
      setMessage('兩次輸入的新密碼不一致。');
      return;
    }

    if (newPassword.length < 8) {
      setMessage('密碼至少需要 8 個字元。');
      return;
    }

    setFormBusy(form, true);
    setMessage('');

    try {
      await auth.changePassword({ currentPassword, newPassword });
      form.reset();
      setMessage('密碼已更新，其他裝置已登出。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      setFormBusy(form, false);
    }
  });

  const deleteAccountStart = document.getElementById('deleteAccountStart');
  const deleteAccountForm = document.getElementById('deleteAccountForm');
  const deleteAccountCancel = document.getElementById('deleteAccountCancel');

  deleteAccountStart.addEventListener('click', () => {
    deleteAccountStart.hidden = true;
    deleteAccountForm.hidden = false;
    document.getElementById('deleteAccountPassword').focus();
  });

  deleteAccountCancel.addEventListener('click', () => {
    deleteAccountForm.reset();
    deleteAccountForm.hidden = true;
    deleteAccountStart.hidden = false;
    setMessage('');
  });

  deleteAccountForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = document.getElementById('deleteAccountPassword').value;

    if (!document.getElementById('deleteAccountConfirm').checked) {
      setMessage('請先確認你了解帳號、所有評價與留言將永久刪除。');
      return;
    }

    setFormBusy(form, true);
    deleteAccountCancel.disabled = true;
    setMessage('');

    try {
      await auth.deleteAccount(password);
      window.location.href = '/account?deleted=1';
    } catch (error) {
      console.error('Unable to delete account:', error);
      const text = error.message && /[\u3400-\u9FFF]/u.test(error.message)
        ? error.message
        : auth.friendlyMessage(error);
      setMessage(text);
    } finally {
      setFormBusy(form, false);
      deleteAccountCancel.disabled = false;
    }
  });

  document.getElementById('logoutButton').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    setMessage('');

    try {
      await auth.signOut();
      reviewsList.replaceChildren();
      notificationsList.replaceChildren();
      notificationsCount.hidden = true;
      badgeAchievement.hidden = true;
      seenBadgeStorageKey = '';
      showPanel('login');
      setMessage('你已登出。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      button.disabled = false;
    }
  });

  async function initialize() {
    if (accountDeleted) {
      sessionStorage.removeItem('cruiseVerificationEmail');
      localStorage.removeItem(pendingTermsKey);
      await auth.signOut().catch(() => {});
      showDeletedPanel();
      return;
    }

    try {
      const session = await auth.getSession();

      if (session?.user) {
        await savePendingTermsAcceptance();
        await activateProfile(session);
      } else if (verificationEmail) {
        showPanel('verify');
      } else {
        showPanel('login');
      }
    } catch (error) {
      loading.textContent = '登入服務尚未設定完成，請稍後再試。';
      loading.classList.add('error');
    }
  }

  initialize();
})();
