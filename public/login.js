import { escapeHtml } from './js/format.js';

const DEMO = [
  ['Dr. Sourabh', 'Researcher (CSE)', 'sourabh@lnmiit.ac.in'],
  ['Prayag Vijay', 'Research Administrator', 'prayag.vijay@lnmiit.ac.in'],
  ['Pulkit Mittal', 'Research Administrator', 'pulkit.mittal@lnmiit.ac.in'],
  ['Lakshya Singhal', 'Head of Department (CSE)', 'lakshya.singhal@lnmiit.ac.in'],
  ['Kartik Mantri', 'Head of Department (ECE)', 'kartik.mantri@lnmiit.ac.in'],
  ['Dr. Neha Kulkarni', 'Researcher (ECE)', 'neha.kulkarni@lnmiit.ac.in'],
  ['Dr. Arjun Bhatt', 'Researcher (CSE)', 'arjun.bhatt@lnmiit.ac.in'],
  ['Dr. Ritu Saxena', 'Researcher (MTH), deactivated', 'ritu.saxena@lnmiit.ac.in'],
];

const form = document.getElementById('login-form');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const flashArea = document.getElementById('flash-area');
const button = document.getElementById('login-btn');

function show(type, text) {
  flashArea.innerHTML = `<div class="flash ${type}" role="${type === 'error' ? 'alert' : 'status'}"><div class="flash-text">${escapeHtml(text)}</div></div>`;
}

// Message passed across a redirect (e.g. session expired).
try {
  const raw = sessionStorage.getItem('rp_flash');
  if (raw) {
    sessionStorage.removeItem('rp_flash');
    const { type, text } = JSON.parse(raw);
    show(type, text);
  }
} catch { /* ignore */ }

const tbody = document.getElementById('demo-accounts');
tbody.innerHTML = DEMO.map(
  ([name, role, email]) => `<tr data-email="${escapeHtml(email)}" tabindex="0"><td>${escapeHtml(name)}</td><td>${escapeHtml(role)}</td><td>${escapeHtml(email)}</td></tr>`
).join('');
tbody.querySelectorAll('tr').forEach((tr) => {
  const fill = () => {
    emailEl.value = tr.dataset.email;
    passwordEl.value = 'demo123';
    button.focus();
  };
  tr.addEventListener('click', fill);
  tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') fill(); });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  flashArea.innerHTML = '';
  if (!emailEl.value.trim() || !passwordEl.value) {
    show('error', 'Enter your e-mail and password.');
    return;
  }
  button.disabled = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: emailEl.value.trim(), password: passwordEl.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      show('error', data.message || 'The login could not be completed. Retry.');
      return;
    }
    try { sessionStorage.setItem('rp_logged_in', '1'); } catch { /* ignore */ }
    window.location.href = data.home;
  } catch {
    show('error', 'The server could not be reached. Check your connection and retry.');
  } finally {
    button.disabled = false;
  }
});
