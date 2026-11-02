/* Goalie: shared storage helpers + signup/login logic.
   NOTE: data lives in this browser's localStorage (no backend yet). */
(function () {
  'use strict';
  const USERS = 'goalie_users', SESSION = 'goalie_session';

  const read = (k, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; }
    catch { return fallback; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const getSession = () => {
    const email = read(SESSION, null);
    return email && read(USERS, {})[email] ? email : null;
  };
  const requireLogin = () => {
    const email = getSession();
    if (!email) location.replace('login.html');
    return email;
  };
  const logout = () => { localStorage.removeItem(SESSION); location.href = 'login.html'; };

  window.Goalie = { read, write, getSession, requireLogin, logout };

  const randomSalt = () => {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  async function hash(pw, salt) {
    const data = new TextEncoder().encode(salt + pw);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0; for (const c of salt + pw) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'f' + h;
  }

  /* ---------- form helpers ---------- */
  const NAME_RE = /^[\p{L}][\p{L}\s'’-]{1,39}$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(input, msg) {
    const out = document.getElementById(input.id + '-error');
    if (out) out.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }

  function bind(form, rules, onValid) {
    const formError = form.querySelector('.form-error');
    const button = form.querySelector('button[type="submit"]');
    rules.forEach(([input, check]) =>
      input.addEventListener('input', () => { setError(input, ''); formError.textContent = ''; }));

    form.querySelectorAll('[data-show-password]').forEach(box =>
      box.addEventListener('change', () =>
        form.querySelectorAll('input[data-password]').forEach(p => p.type = box.checked ? 'text' : 'password')));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      formError.textContent = '';
      let firstBad = null;
      rules.forEach(([input, check]) => {
        if (!setError(input, check(input.value.trim(), input)) && !firstBad) firstBad = input;
      });
      if (firstBad) return firstBad.focus();
      button.disabled = true;
      try { await onValid(); }
      catch { formError.textContent = 'Something went wrong. Check that your browser allows site storage, then try again.'; }
      button.disabled = false;
    });
  }

  const $ = id => document.getElementById(id);

  /* ---------- signup ---------- */
  const signup = $('signup-form');
  if (signup) {
    if (getSession()) location.replace('dashboard.html');
    const f = { last: $('surname'), first: $('firstname'), email: $('email'), pass: $('pass'), confirm: $('confirm'), job: $('occupation') };
    bind(signup, [
      [f.last, v => NAME_RE.test(v) ? '' : 'Enter your surname (letters only, 2–40 characters).'],
      [f.first, v => NAME_RE.test(v) ? '' : 'Enter your name (letters only, 2–40 characters).'],
      [f.email, v => EMAIL_RE.test(v) ? '' : 'Enter a valid email, like you@gmail.com.'],
      [f.pass, v => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? '' : 'Use at least 8 characters with a letter and a number.'],
      [f.confirm, v => v === f.pass.value.trim() ? '' : 'Passwords do not match.'],
      [f.job, v => v ? '' : 'Choose your occupation.']
    ], async () => {
      const users = read(USERS, {});
      const email = f.email.value.trim().toLowerCase();
      if (users[email]) return setError(f.email, 'An account with this email already exists. Log in instead.');
      const salt = randomSalt();
      users[email] = {
        first: f.first.value.trim(), last: f.last.value.trim(), occupation: f.job.value,
        salt, hash: await hash(f.pass.value.trim(), salt), created: Date.now()
      };
      write(USERS, users);
      write(SESSION, email);
      location.href = 'dashboard.html';
    });
  }

  /* ---------- login ---------- */
  const login = $('login-form');
  if (login) {
    if (getSession()) location.replace('dashboard.html');
    const email = $('email'), pass = $('pass');
    bind(login, [
      [email, v => EMAIL_RE.test(v) ? '' : 'Enter a valid email, like you@gmail.com.'],
      [pass, v => v ? '' : 'Enter your password.']
    ], async () => {
      const user = read(USERS, {})[email.value.trim().toLowerCase()];
      const ok = user && (await hash(pass.value.trim(), user.salt)) === user.hash;
      if (!ok) return void (login.querySelector('.form-error').textContent = 'Email or password is incorrect.');
      write(SESSION, email.value.trim().toLowerCase());
      location.href = 'dashboard.html';
    });
  }
})();