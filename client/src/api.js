const TOKEN_KEY = 'qa-mailbox-token';

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (value) => localStorage.setItem(TOKEN_KEY, value),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token.get() ? { authorization: `Bearer ${token.get()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error('Cannot reach the API. The request failed or timed out — check your connection and try again.');
    error.status = 0;
    throw error;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  health: () => request('/health'),
  allMailbox: ({ limit = 25, pageToken = '', from = '', to = '', timezoneOffset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), timezoneOffset: String(timezoneOffset) });
    if (pageToken) params.set('pageToken', pageToken);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request(`/mailbox/all?${params.toString()}`);
  },
  messages: (alias, search, globalSearch = false, searchBy = 'all', pageToken = '', limit = 25) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (alias) params.set('alias', alias);
    if (globalSearch) params.set('global', 'true');
    if (searchBy && searchBy !== 'all') params.set('searchBy', searchBy);
    if (search) params.set('search', search);
    if (pageToken) params.set('pageToken', pageToken);
    return request(`/messages?${params.toString()}`);
  },
};
