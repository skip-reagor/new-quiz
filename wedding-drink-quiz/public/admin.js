const $ = (selector) => document.querySelector(selector);
function escapeHtml(value) { const d = document.createElement('div'); d.textContent = value || ''; return d.innerHTML; }
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
async function loadDashboard() {
  const res = await fetch('/api/admin/results'); if (res.status === 401) return showLogin();
  const data = await res.json(); $('#total-results').textContent = data.totalResponses; $('#total-messages').textContent = data.totalMessages;
  const outcomeEntries = Object.entries(data.outcomes).sort((a, b) => b[1] - a[1]);
  $('#outcomes').innerHTML = outcomeEntries.length ? outcomeEntries.map(([name, count]) => `<article class="outcome"><strong>${count}</strong><span>${escapeHtml(name)}</span></article>`).join('') : '<p class="empty">No completed quizzes yet.</p>';
  $('#responses').innerHTML = data.responses.length ? data.responses.map((item) => `<article class="response"><div class="response-head"><div><h3>${escapeHtml(item.drinkName)}</h3><time>${formatDate(item.createdAt)}</time></div>${item.guestName ? `<strong>${escapeHtml(item.guestName)}</strong>` : ''}</div>${item.message ? `<blockquote>${escapeHtml(item.message)}</blockquote>` : '<p class="no-message">No message left.</p>'}</article>`).join('') : '<p class="empty">No guest activity yet.</p>';
  $('#login-view').classList.add('hidden'); $('#dashboard-view').classList.remove('hidden');
}
function showLogin() { $('#dashboard-view').classList.add('hidden'); $('#login-view').classList.remove('hidden'); }
$('#login-form').onsubmit = async (event) => { event.preventDefault(); $('#login-error').textContent = ''; const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) }); if (!res.ok) { $('#login-error').textContent = (await res.json()).error; return; } event.target.reset(); loadDashboard(); };
$('#refresh').onclick = loadDashboard;
$('#logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); };
fetch('/api/admin/session').then((res) => res.json()).then(({ authenticated }) => authenticated ? loadDashboard() : showLogin());
