import { createAuthClient } from '@neondatabase/neon-js/auth';

let clientPromise;

function normalizeError(error) {
  if (!error) {
    return new Error('UNKNOWN_AUTH_ERROR');
  }

  if (error instanceof Error) {
    return error;
  }

  const normalized = new Error(error.message || 'UNKNOWN_AUTH_ERROR');
  normalized.code = error.code;
  normalized.status = error.status;
  return normalized;
}

function friendlyMessage(error) {
  const details = `${error?.code || ''} ${error?.message || ''}`.toUpperCase();

  if (details.includes('USER_ALREADY_EXISTS')) {
    return '這個電子信箱已經註冊，請直接登入。';
  }

  if (details.includes('INVALID_EMAIL_OR_PASSWORD')) {
    return '電子信箱或密碼不正確。';
  }

  if (details.includes('INVALID_CURRENT_PASSWORD') || details.includes('INVALID_PASSWORD')) {
    return '目前的密碼不正確。';
  }

  if (details.includes('DELETE') && (details.includes('DISABLED') || error?.status === 404)) {
    return '目前無法自動刪除帳號，請聯絡管理員。';
  }

  if (details.includes('EMAIL_NOT_VERIFIED')) {
    return '請先輸入電子郵件中的驗證碼。';
  }

  if (details.includes('OTP') && (details.includes('INVALID') || details.includes('EXPIRED'))) {
    return '驗證碼不正確或已過期，請重新取得驗證碼。';
  }

  if (details.includes('PASSWORD') && (details.includes('SHORT') || details.includes('LENGTH'))) {
    return '密碼至少需要 8 個字元。';
  }

  if (details.includes('INVALID_EMAIL')) {
    return '請輸入正確的電子信箱。';
  }

  if (details.includes('TOO_MANY') || error?.status === 429) {
    return '操作次數過多，請稍後再試。';
  }

  if (details.includes('FETCH') || details.includes('NETWORK')) {
    return '目前無法連線到登入服務，請稍後再試。';
  }

  return '目前無法完成操作，請稍後再試。';
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = fetch('/api/config', { credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) {
          throw new Error('AUTH_CONFIG_UNAVAILABLE');
        }

        const config = await response.json();

        if (!config.neonAuthUrl) {
          throw new Error('AUTH_CONFIG_UNAVAILABLE');
        }

        return createAuthClient(config.neonAuthUrl);
      });
  }

  return clientPromise;
}

async function run(action) {
  try {
    const client = await getClient();
    const result = await action(client);

    if (result?.error) {
      throw normalizeError(result.error);
    }

    return result?.data ?? result ?? null;
  } catch (error) {
    throw normalizeError(error);
  }
}

async function getSession() {
  return run(client => client.getSession());
}

async function getToken() {
  // Neon Auth dołącza JWT do obiektu bieżącej sesji.
  // Pobieranie go z osobnego endpointu /token może zwrócić pustą wartość,
  // mimo że użytkownik pozostaje poprawnie zalogowany.
  const session = await getSession();
  return session?.session?.token || '';
}

async function signUp({ name, email, password }) {
  const data = await run(client => client.signUp.email({ name, email, password }));
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function verifyEmail({ email, otp }) {
  const data = await run(client => client.emailOtp.verifyEmail({ email, otp }));
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function resendVerificationCode(email) {
  return run(client => client.emailOtp.sendVerificationOtp({
    email,
    type: 'email-verification'
  }));
}

async function signIn({ email, password }) {
  const data = await run(client => client.signIn.email({ email, password }));
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function signOut() {
  const data = await run(client => client.signOut());
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function updateName(name) {
  const data = await run(client => client.updateUser({ name }));
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function changePassword({ currentPassword, newPassword }) {
  const data = await run(client => client.changePassword({
    currentPassword,
    newPassword,
    revokeOtherSessions: true
  }));
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function deleteAccount(password) {
  const session = await getSession();
  const email = session?.user?.email || '';

  if (!email) {
    const error = new Error('AUTH_REQUIRED');
    error.status = 401;
    throw error;
  }

  // Ponowne logowanie potwierdza bieżące hasło przed nieodwracalną operacją.
  await run(client => client.signIn.email({ email, password }));
  const token = await getToken();

  if (!token) {
    const error = new Error('AUTH_REQUIRED');
    error.status = 401;
    throw error;
  }

  const response = await fetch('/api/me/account', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'ACCOUNT_DELETE_FAILED');
    error.status = response.status;
    throw error;
  }

  await run(client => client.signOut()).catch(() => {});
  window.dispatchEvent(new CustomEvent('cruise-auth-changed'));
  return data;
}

async function requestPasswordReset(email) {
  return run(client => client.emailOtp.requestPasswordReset({ email }));
}

async function resetPassword({ email, otp, password }) {
  return run(client => client.emailOtp.resetPassword({ email, otp, password }));
}

async function authFetch(url, options = {}) {
  const token = await getToken();

  if (!token) {
    const error = new Error('AUTH_REQUIRED');
    error.status = 401;
    throw error;
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, { ...options, headers });
}

function safeReturnPath(value, fallback = '/account') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  return value;
}

async function updateNavigation(root = document) {
  const links = root.querySelectorAll('[data-auth-link]');

  if (!links.length) {
    return;
  }

  try {
    const session = await getSession();
    const isLoggedIn = Boolean(session?.user);
    const isAccountPage = window.location.pathname.replace(/\/+$/, '') === '/account';

    links.forEach(link => {
      link.href = '/account';
      link.textContent = isLoggedIn ? '我的帳號' : '登入／註冊';
      link.hidden = isAccountPage;
    });
  } catch {
    const isAccountPage = window.location.pathname.replace(/\/+$/, '') === '/account';

    links.forEach(link => {
      link.href = '/account';
      link.textContent = '登入／註冊';
      link.hidden = isAccountPage;
    });
  }
}

window.CruiseAuth = {
  authFetch,
  changePassword,
  deleteAccount,
  friendlyMessage,
  getSession,
  getToken,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  safeReturnPath,
  signIn,
  signOut,
  signUp,
  updateName,
  updateNavigation,
  verifyEmail
};

window.dispatchEvent(new CustomEvent('cruise-auth-ready'));
