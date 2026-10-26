// fetch wrapper for the REST API. On 401 the browser goes to /login.

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || 'The request could not be completed.');
    this.status = status;
    this.code = (body && body.code) || (status === 0 ? 'NETWORK' : 'ERROR');
    this.body = body || {};
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'The server could not be reached. Check your connection and retry.' });
  }

  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }

  if (res.status === 401) {
    try {
      if (sessionStorage.getItem('rp_logged_in')) {
        sessionStorage.setItem('rp_flash', JSON.stringify({ type: 'info', text: 'Your session has expired. Please log in again.' }));
        sessionStorage.removeItem('rp_logged_in');
      }
    } catch { /* storage unavailable */ }
    window.location.href = '/login';
    return new Promise(() => {}); // the page is being left
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
