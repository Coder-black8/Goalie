/* Goalie dashboard: weekly goals, reminders, and weekly percentage score. */
(function () {
  'use strict';
  const G = window.Goalie;
  const email = G.requireLogin();
  if (!email) return;

  const user = G.read('goalie_users', {})[email];
  const GOALS_KEY = 'goalie_goals_' + email, SEEN_KEY = 'goalie_seen_' + email;
  let goals = G.read(GOALS_KEY, []);
  const $ = id => document.getElementById(id);

  /* ---------- dates (weeks run Monday to Sunday, local time) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekKey = (d = new Date()) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return ymd(x);
  };
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const range = k => { const s = parseKey(k), e = new Date(s); e.setDate(e.getDate() + 6); return `${fmt(s)} to ${fmt(e)}`; };
  const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const stats = list => {
    const done = list.filter(g => g.done).length;
    return { done, total: list.length, pct: list.length ? Math.round(done / list.length * 100) : 0 };
  };

  const save = () => {
    try { G.write(GOALS_KEY, goals); }
    catch { toast('Could not save your goals. Check that your browser allows site storage.'); }
  };

  /* ---------- toasts + notifications ---------- */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    const span = document.createElement('span'); span.textContent = msg;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Dismiss');
    x.onclick = () => t.remove();
    t.append(span, x);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 10000);
  }

  const notifyBtn = $('notify');
  const canNotify = 'Notification' in window;
  function syncNotifyButton() { notifyBtn.hidden = !(canNotify && Notification.permission === 'default'); }
  notifyBtn.onclick = () => Notification.requestPermission().then(syncNotifyButton);

  function checkReminders() {
    const today = ymd(new Date()), now = hm(), wk = weekKey();
    let changed = false;
    goals.forEach(g => {
      if (g.week === wk && !g.done && g.remind && g.remind <= now && g.lastReminded !== today) {
        g.lastReminded = today; changed = true;
        toast(`Reminder: ${g.text}`);
        if (canNotify && Notification.permission === 'granted') new Notification('Goalie reminder', { body: g.text });
      }
    });
    if (changed) save();
  }

  /* ---------- render ---------- */
  let renderedWeek = weekKey();

  function render() {
    const wk = renderedWeek = weekKey();
    const current = goals.filter(g => g.week === wk);
    const { done, total, pct } = stats(current);

    $('ring').style.setProperty('--p', pct);
    $('ring').setAttribute('aria-label', `${pct} percent of goals completed`);
    $('pct').textContent = pct + '%';
    $('week-label').textContent = 'Week of ' + range(wk);

    const daysLeft = 6 - ((new Date().getDay() + 6) % 7);
    $('days-left').textContent = daysLeft === 0 ? 'Last day of the week. Finish strong.'
      : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left this week.`;

    $('score-msg').textContent = !total ? 'Add your first goal for this week below.'
      : pct === 100 ? `Perfect week! All ${total} goals done.`
      : pct >= 70 ? `${done} of ${total} goals done. Almost there.`
      : pct >= 40 ? `${done} of ${total} goals done. Keep going.`
      : `${done} of ${total} goals done. There is still time.`;

    const list = $('goal-list'); list.replaceChildren();
    $('empty').hidden = total > 0;
    current.forEach(g => {
      const li = document.createElement('li'); li.dataset.id = g.id; if (g.done) li.className = 'done';
      const label = document.createElement('label');
      const box = document.createElement('input'); box.type = 'checkbox'; box.checked = g.done;
      const text = document.createElement('span'); text.className = 'text'; text.textContent = g.text;
      label.append(box, text);
      li.append(label);
      if (g.remind) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'Reminder ' + g.remind; li.append(b); }
      const del = document.createElement('button'); del.type = 'button'; del.className = 'del';
      del.textContent = 'Delete'; del.setAttribute('aria-label', 'Delete goal: ' + g.text);
      li.append(del); list.append(li);
    });

    const weeks = [...new Set(goals.map(g => g.week).filter(w => w !== wk))].sort().reverse();
    const hist = $('history'); hist.replaceChildren();
    $('no-history').hidden = weeks.length > 0;
    weeks.forEach(w => {
      const s = stats(goals.filter(g => g.week === w));
      const li = document.createElement('li');
      li.innerHTML = '<span></span><strong></strong>';
      li.firstChild.textContent = `${range(w)}: ${s.done} of ${s.total} goals`;
      li.lastChild.textContent = s.pct + '%';
      hist.append(li);
    });

    const last = weeks[0], banner = $('review');
    if (last && G.read(SEEN_KEY, '') !== last) {
      const s = stats(goals.filter(g => g.week === last));
      banner.replaceChildren();
      const p = document.createElement('span');
      p.textContent = `Last week's score (${range(last)}): ${s.pct}%. You completed ${s.done} of ${s.total} goals.`;
      const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'Got it';
      ok.onclick = () => { G.write(SEEN_KEY, last); banner.hidden = true; };
      banner.append(p, ok); banner.hidden = false;
    } else banner.hidden = true;
  }

  /* ---------- events ---------- */
  $('who').textContent = `Hi, ${user.first}`;
  $('logout').onclick = G.logout;

  $('goal-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('goal-text'), err = $('goal-error');
    const text = input.value.trim().replace(/\s+/g, ' ');
    const wk = weekKey();
    err.textContent = '';
    if (!text) return void (err.textContent = 'Type a goal first.');
    if (goals.some(g => g.week === wk && g.text.toLowerCase() === text.toLowerCase()))
      return void (err.textContent = 'You already have this goal this week.');
    const remind = $('goal-time').value;
    goals.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text, week: wk, done: false, remind,
      lastReminded: remind && remind <= hm() ? ymd(new Date()) : '' // don't fire for a time that already passed today
    });
    save(); input.value = ''; $('goal-time').value = ''; input.focus(); render();
  });

  $('goal-list').addEventListener('change', e => {
    const li = e.target.closest('li'); if (!li || e.target.type !== 'checkbox') return;
    const g = goals.find(x => x.id === li.dataset.id);
    if (g) { g.done = e.target.checked; save(); render(); }
  });
  $('goal-list').addEventListener('click', e => {
    if (!e.target.classList.contains('del')) return;
    const id = e.target.closest('li').dataset.id;
    goals = goals.filter(g => g.id !== id); save(); render();
  });

  /* ---------- start ---------- */
  syncNotifyButton();
  render();
  checkReminders();
  setInterval(() => { if (weekKey() !== renderedWeek) render(); checkReminders(); }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { if (weekKey() !== renderedWeek) render(); checkReminders(); }
  });
})();