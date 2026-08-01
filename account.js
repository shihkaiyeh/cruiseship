(function () {
  const auth = window.CruiseAuth;
  const loading = document.getElementById('accountLoading');
  const guest = document.getElementById('guestAccount');
  const profile = document.getElementById('loggedInAccount');
  const message = document.getElementById('authMessage');
  const tabs = [...document.querySelectorAll('[data-auth-panel]')];
  const forms = [...document.querySelectorAll('[data-auth-form]')];
  const returnPath = auth.safeReturnPath(
    new URLSearchParams(window.location.search).get('returnTo'),
    '/account'
  );
  let verificationEmail = sessionStorage.getItem('cruiseVerificationEmail') || '';
  let resetEmail = '';

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
    loading.hidden = true;
    guest.hidden = true;
    profile.hidden = false;
    document.getElementById('accountName').textContent = user.name || '郵輪旅人';
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountInitial').textContent = (user.name || '航').trim().charAt(0) || '航';
    setMessage('');
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

      if (returnPath !== '/account') {
        window.location.href = returnPath;
        return;
      }

      const session = await auth.getSession();
      showProfile(session);
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

    if (password !== passwordConfirm) {
      setMessage('兩次輸入的密碼不一致。');
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
        if (returnPath !== '/account') {
          window.location.href = returnPath;
          return;
        }
        showProfile(session);
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

  document.getElementById('logoutButton').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    setMessage('');

    try {
      await auth.signOut();
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
      const session = await auth.getSession();

      if (session?.user) {
        showProfile(session);
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
