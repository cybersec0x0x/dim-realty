const BASE = '/api';

function token() { return localStorage.getItem('dr_token'); }
function headers(json = true) {
  const h = { Authorization: `Bearer ${token()}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function req(method, url, body, formData) {
  const opts = { method, headers: headers(!formData) };
  if (body) opts.body = formData ? body : JSON.stringify(body);
  let res;
  try {
    res = await fetch(BASE + url, opts);
  } catch {
    throw new Error('Немає звʼязку з сервером. Перевірте інтернет і спробуйте ще раз.');
  }
  // 401 on the login form itself means "wrong password", not "session expired"
  if (res.status === 401 && !url.startsWith('/auth/login')) { localStorage.clear(); location.href = '/'; return; }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON answer (e.g. proxy error page) */ }
  if (!res.ok) throw new Error(data.error || `Помилка запиту (${res.status})`);
  return data;
}

window.api = {
  get:    (u)     => req('GET',    u),
  post:   (u, b)  => req('POST',   u, b),
  put:    (u, b)  => req('PUT',    u, b),
  patch:  (u, b)  => req('PATCH',  u, b),
  del:    (u)     => req('DELETE', u),
  upload: (u, fd) => req('POST',   u, fd, true),
  upd:    (u, fd) => req('PUT',    u, fd, true),
};
