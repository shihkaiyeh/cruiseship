(function () {
  const auth = window.CruiseAuth;
  const loading = document.getElementById('accountLoading');
  const guest = document.getElementById('guestAccount');
  const profile = document.getElementById('loggedInAccount');
  const message = document.getElementById('authMessage');
  const tabs = [...document.querySelectorAll('[data-auth-panel]')];
  const forms = [...document.querySelectorAll('[data-auth-form]')];
  const reviewsLoading = document.getElementById('accountReviewsLoading');
  const reviewsList = document.getElementById('accountReviewsList');
  const reviewsEmpty = document.getElementById('accountReviewsEmpty');
  const termsVersion = '2026-08-01';
  const pendingTermsKey = 'cruisePendingTermsAcceptance';
  const pendingCleanupKey = 'cruisePendingAccountCleanupToken';
  const accountDeleted = new URLSearchParams(window.location.search).get('deleted') === '1';
  const returnPath = auth.safeReturnPath(
    new URLSearchParams(window.location.search).get('returnTo'),
    '/account'
  );
  let verificationEmail = sessionStorage.getItem('cruiseVerificationEmail') || '';
  let resetEmail = '';

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

  function setFormBusy(form, isBusy) {
    form.querySelectorAll('button, input').forEach(control => {
      control.disabled = isBusy;
    });
  }

  function showPanel(panelName) {
    guest.hidden = false;
    profile.hidden = true;
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
    loading.hidden = true;
    guest.hidden = true;
    profile.hidden = false;
    document.getElementById('accountName').textContent = displayName;
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountInitial').textContent = displayName.trim().charAt(0) || '航';
    document.getElementById('profileNameInput').value = displayName;
    setMessage('');
  }

  function createElement(tagName, className = '', text = '') {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
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

      const opinions = Array.isArray(data) ? data : [];
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
    await loadMyOpinions();
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

  async function cleanupAccountData(token) {
    const response = await fetch('/api/me/data', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true
    });

    if (!response.ok) {
      throw new Error('ACCOUNT_DATA_CLEANUP_FAILED');
    }

    sessionStorage.removeItem(pendingCleanupKey);
  }

  async function retryPendingAccountCleanup() {
    const token = sessionStorage.getItem(pendingCleanupKey);

    if (!token) {
      return;
    }

    try {
      await cleanupAccountData(token);
    } catch (error) {
      console.error('Unable to finish account data cleanup:', error);
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.authPanel));
  });

  document.querySelectorAll('[data-show-panel]').forEach(button => {
    button.addEventListener('click', () => showPanel(button.dataset.showPanel));
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
      setMessage(auth.friendlyMessage(error));
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
      setMessage('請先確認你了解帳號與所有評價將永久刪除。');
      return;
    }

    setFormBusy(form, true);
    deleteAccountCancel.disabled = true;
    setMessage('');

    try {
      const result = await auth.deleteAccount(password);

      if (result.data?.message === 'Verification email sent') {
        sessionStorage.removeItem(pendingCleanupKey);
        setMessage('請查看電子郵件並完成帳號刪除。', 'success');
        return;
      }

      sessionStorage.setItem(pendingCleanupKey, result.token);

      try {
        await cleanupAccountData(result.token);
      } catch (error) {
        console.error('Account deleted, cleanup will be retried:', error);
      }

      window.location.href = '/account?deleted=1';
    } catch (error) {
      sessionStorage.removeItem(pendingCleanupKey);
      setMessage(auth.friendlyMessage(error));
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
      showPanel('login');
      setMessage('你已登出。', 'success');
    } catch (error) {
      setMessage(auth.friendlyMessage(error));
    } finally {
      button.disabled = false;
    }
  });

  async function initialize() {
    try {
      await retryPendingAccountCleanup();
      const session = await auth.getSession();

      if (session?.user) {
        await savePendingTermsAcceptance();
        await activateProfile(session);
      } else if (verificationEmail) {
        showPanel('verify');
      } else {
        showPanel('login');

        if (accountDeleted) {
          setMessage('帳號與所有評價已刪除。', 'success');
        }
      }
    } catch (error) {
      loading.textContent = '登入服務尚未設定完成，請稍後再試。';
      loading.classList.add('error');
    }
  }

  initialize();
})();
