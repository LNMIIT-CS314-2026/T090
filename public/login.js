import { escapeHtml } from './js/format.js';

// Demo accounts grouped by role: [name, detail, e-mail].
const DEMO = [
  ['Researchers', [
    ['Dr. Sourabh', 'CSE', 'sourabh@lnmiit.ac.in'],
    ['Dr. Arjun Bhatt', 'CSE', 'arjun.bhatt@lnmiit.ac.in'],
    ['Dr. Neha Kulkarni', 'ECE', 'neha.kulkarni@lnmiit.ac.in'],
    ['Dr. Priya Nair', 'CCE', 'priya.nair@lnmiit.ac.in'],
    ['Dr. Vivek Chauhan', 'ME', 'vivek.chauhan@lnmiit.ac.in'],
    ['Dr. Ritu Saxena', 'MTH, deactivated', 'ritu.saxena@lnmiit.ac.in'],
  ]],
  ['Heads of Department', [
    ['Lakshya Singhal', 'CSE', 'lakshya.singhal@lnmiit.ac.in'],
    ['Kartik Mantri', 'ECE', 'kartik.mantri@lnmiit.ac.in'],
    ['Dr. Anjali Verma', 'MTH', 'anjali.verma@lnmiit.ac.in'],
    ['Dr. Rajesh Khanna', 'CCE', 'rajesh.khanna@lnmiit.ac.in'],
    ['Dr. Suresh Patil', 'ME', 'suresh.patil@lnmiit.ac.in'],
  ]],
  ['Research office and management', [
    ['Prayag Vijay', 'Research Administrator', 'prayag.vijay@lnmiit.ac.in'],
    ['Pulkit Mittal', 'Research Administrator', 'pulkit.mittal@lnmiit.ac.in'],
    ['Dr. Meenakshi Rao', 'Institute Management, Dean R&D', 'meenakshi.rao@lnmiit.ac.in'],
  ]],
  ['System administrator', [
    ['Vikram Joshi', 'Users and roles', 'vikram.joshi@lnmiit.ac.in'],
  ]],
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

const groups = document.getElementById('demo-accounts');
groups.innerHTML = DEMO.map(([title, accounts]) => `
  <section class="demo-group box">
    <h3>${escapeHtml(title)}</h3>
    <ul>${accounts.map(([name, detail, email]) => `
      <li data-email="${escapeHtml(email)}" tabindex="0" role="button" title="${escapeHtml(email)}">
        <span class="demo-name">${escapeHtml(name)}</span> <span class="muted">${escapeHtml(detail)}</span>
        <span class="demo-email">${escapeHtml(email)}</span>
      </li>`).join('')}
    </ul>
  </section>`).join('');
groups.querySelectorAll('li[data-email]').forEach((tr) => {
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
