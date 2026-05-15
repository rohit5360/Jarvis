/* ============================================================
   api.js — CUE fetch client
   All HTTP requests go through here
   ============================================================ */

const API = {
  async request(method, url, body = null) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  get:    (url)        => API.request('GET',    url),
  post:   (url, body)  => API.request('POST',   url, body),
  put:    (url, body)  => API.request('PUT',    url, body),
  patch:  (url, body)  => API.request('PATCH',  url, body),
  delete: (url)        => API.request('DELETE', url),

  // ── Auth ──
  auth: {
    me:     ()             => API.get('/api/auth/me'),
    login:  (username, password) => API.post('/api/auth/login',  { username, password }),
    signup: (body)         => API.post('/api/auth/signup', body),
    logout: ()             => API.post('/api/auth/logout'),
  },
  // ── Profile ──
  profile: {
    get:    ()     => API.get('/api/profile'),
    update: (body) => API.put('/api/profile', body),
  },
  // ── Memory / CUE ──
  memory: {
    getAll: ()     => API.get('/api/memory'),
    add:    (body) => API.post('/api/memory', body),
    delete: (id)   => API.delete(`/api/memory/${id}`),
    update: (id, body) => API.put(`/api/memory/${id}`, body),
    process:(input)=> API.post('/api/cue/process', { input }),
  },
  // ── Admin ──
  admin: {
    stats:       ()             => API.get('/api/admin/stats'),
    users:       ()             => API.get('/api/admin/users'),
    addUser:     (body)         => API.post('/api/admin/users', body),
    deleteUser:  (id)           => API.delete(`/api/admin/users/${id}`),
    changeRole:  (id, role)     => API.patch(`/api/admin/users/${id}/role`, { role }),
    logs:        (limit = 100)  => API.get(`/api/admin/logs?limit=${limit}`),
    getSettings: ()             => API.get('/api/admin/settings'),
    saveSettings:(body)         => API.put('/api/admin/settings', body),
  }
};

/* ─── UI helpers ─── */
let _toastTimer;
function showToast(msg, type = 'success') {
  let t = document.getElementById('__toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '__toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  const icon = type === 'success'
    ? Icons._svg('<polyline points="20 6 9 17 4 12"/>', 14)
    : Icons._svg('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', 14);
  t.innerHTML = icon + msg;
  t.className = `toast show toast-${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function setAlert(el, msg, type = 'error') {
  if (!el) return;
  const icon = type === 'error'
    ? Icons._svg('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', 15)
    : Icons._svg('<polyline points="20 6 9 17 4 12"/>', 15);
  el.innerHTML = icon + `<span>${msg}</span>`;
  el.className = `alert alert-${type} show`;
}
function clearAlert(el) { if (el) { el.className = 'alert'; el.innerHTML = ''; } }

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn._orig = btn.innerHTML;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spinOnce 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Loading`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._orig || btn.innerHTML;
    btn.disabled  = false;
  }
}

/* ─── Auth guard (call on protected pages) ─── */
async function guardAuth(adminRequired = false) {
  try {
    const me = await API.auth.me();
    if (adminRequired && me.role !== 'admin') {
      window.location.href = '/dashboard.html'; return null;
    }
    return me;
  } catch {
    window.location.href = '/login.html'; return null;
  }
}

/* ─── Avatar helpers ─── */
function makeAvatar(username, color, sizeClass = 'avatar-sm') {
  const div = document.createElement('div');
  div.className = `avatar ${sizeClass}`;
  div.style.background = color || '#e8a020';
  div.textContent = (username || '?')[0].toUpperCase();
  return div;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
