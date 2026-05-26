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
  const res = await fetch(BASE + url, opts);
  if (res.status === 401) { localStorage.clear(); location.href = '/'; return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Помилка запиту');
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
