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
    const error = new Error('Cannot reach API. Make sure dev server is running and API port 4213 is free.');
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
  me: () => request('/auth/me'),
  health: () => request('/health'),
  messages: (alias, search, globalSearch = false, searchBy = 'all') => {
    const params = new URLSearchParams();
    if (alias) params.set('alias', alias);
    if (globalSearch) params.set('global', 'true');
    if (searchBy && searchBy !== 'all') params.set('searchBy', searchBy);
    if (search) params.set('search', search);
    return request(`/messages?${params.toString()}`);
  },
};
