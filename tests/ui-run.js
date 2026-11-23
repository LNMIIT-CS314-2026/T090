'use strict';
// Assignment 8, TC-26 (section 48.2): citation count typed in W02 with the keyboard, run in headless Chrome.
// No extra packages: Chrome is started with --remote-debugging-port and driven over the DevTools
// protocol with Node's built-in WebSocket (Node 22+). The app runs on a fresh in-memory copy of the
// demo data (DD-10). Usage: node tests/ui-run.js   (set CHROME_PATH if Chrome is not found)
// Exit code 0 = TC-26 passed, 1 = TC-26 failed (DEF-01), 2 = the run could not be performed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { openDb } = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const INPUTS = ['-1', '2.5', '5-', '1e'];
const MESSAGE = 'Citation count must be a whole number ≥ 0.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, what, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

function startChrome(exe) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-ui-'));
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,860', 'about:blank',
  ], { stdio: 'ignore' });
  return { proc, profile };
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  async goto(url, readySelector) {
    await this.send('Page.navigate', { url });
    await waitFor(() => this.eval(`!!document.querySelector(${JSON.stringify(readySelector)})`), readySelector);
  }
}

async function main() {
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) {
    console.error('Chrome / Edge not found. Set CHROME_PATH to the browser executable.');
    process.exit(2);
  }

  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db, { mailLogPath: path.join(os.tmpdir(), `rp-ui-mail-${process.pid}.log`), quiet: true });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const { proc, profile } = startChrome(exe);
  let ws;
  let failed = 0;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = (await waitFor(() => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').split('\n')[0], 'Chrome to start')).trim();
    const targets = await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return list.find((t) => t.type === 'page');
    }, 'a page target');
    ws = new WebSocket(targets.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    const page = new Page(ws);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    // Log in as researcher1 (demo researcher "Dr. Sourabh") through the real login endpoint.
    await page.goto(`${base}/login`, 'body');
    await page.eval(`fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sourabh@lnmiit.ac.in', password: 'demo123' }) }).then((r) => r.status)`);

    console.log('$ node tests/ui-run.js   (TC-26, citation count typed in W02)');
    for (const typed of INPUTS) {
      const title = `Citation Probe ${typed}`;
      const before = db.prepare('SELECT COUNT(*) AS n FROM publications').get().n;

      await page.goto(`${base}/researcher/publications/new`, '#f-title');
      await page.eval(`(() => {
        const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
        set('f-title', ${JSON.stringify(title)}); set('f-authors', 'Sourabh'); set('f-publicationType', 'JOURNAL'); set('f-year', '2024');
        const c = document.getElementById('f-citationCount'); c.value = ''; c.focus();
      })()`);
      await page.send('Input.insertText', { text: typed }); // real keyboard input, as a user types it
      const field = await page.eval(`(() => { const c = document.getElementById('f-citationCount');
        return { value: c.value, badInput: c.validity.badInput }; })()`);
      await page.eval(`document.querySelector('#pub-form button[type=submit]').click()`);

      const outcome = await waitFor(() => page.eval(`(() => {
        const err = document.querySelector('.field[data-field="citationCount"] .error-text');
        const flash = document.querySelector('#flash-area .flash-text');
        if (err) return { kind: 'error', text: err.textContent };
        if (flash) return { kind: 'flash', text: flash.textContent.trim() };
        return null; })()`), `a result for "${typed}"`);
      const saved = db.prepare('SELECT public_id AS publicId, citation_count AS citations FROM publications WHERE title = ?').get(title);
      const after = db.prepare('SELECT COUNT(*) AS n FROM publications').get().n;

      const ok = outcome.kind === 'error' && outcome.text === MESSAGE && !saved && after === before;
      if (!ok) failed++;
      const shown = field.badInput ? `value "" (badInput)` : `value "${field.value}"`;
      const result = saved ? `"${outcome.text}"  citationCount = ${saved.citations}` : `"${outcome.text}"  not saved`;
      console.log(`${JSON.stringify(typed).padEnd(6)} → ${shown.padEnd(18)} → ${result}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(failed ? `TC-26 Fail — ${failed} of ${INPUTS.length} inputs saved without a message (DEF-01)` : 'TC-26 Pass');
  } finally {
    if (ws) ws.close();
    proc.kill();
    await new Promise((resolve) => server.close(resolve));
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`ui-run could not complete: ${err.message}`);
  process.exit(2);
});
