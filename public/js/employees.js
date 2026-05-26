requireAuth();
renderSidebarUser();
initSidebar();

let allEmployees = [];
let deleteId = null;

loadEmployees();

async function loadEmployees() {
  try {
    allEmployees = await api.get('/employees');
    renderTable(allEmployees);
  } catch(e) {
    document.getElementById('employees-tbody').innerHTML =
      `<tr><td colspan="6"><div class="no-results">${e.message}</div></td></tr>`;
  }
}

function filterEmployees() {
  const q = document.getElementById('emp-search').value.toLowerCase();
  renderTable(allEmployees.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q) ||
    (u.phone || '').includes(q)
  ));
}

function renderTable(emps) {
  const tbody = document.getElementById('employees-tbody');
  const user = getUser();
  if (!emps.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><h3>Немає співробітників</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = emps.map(u => {
    const isMe = user && user.id === u.id;
    const canEdit = user && user.role === 'admin';
    return `<tr>
      <td>
        <div class="employee-name">
          <div class="avatar">${u.name.charAt(0).toUpperCase()}</div>
          <div class="emp-details">
            <div class="name">${u.name}${isMe ? ' <span style="color:var(--muted);font-size:11px">(Ви)</span>' : ''}</div>
            <div class="email">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge badge-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
      <td>${u.phone || '<span class="text-muted">—</span>'}</td>
      <td>
        <span class="badge ${u.is_active ? 'badge-active' : 'badge-inactive'}">
          ${u.is_active ? 'Активний' : 'Деактивовано'}
        </span>
      </td>
      <td style="white-space:nowrap">${fmtDate(u.created_at)}</td>
      <td>
        <div class="actions-cell admin-only">
          <button class="btn btn-outline btn-sm btn-icon" onclick="openEdit(${u.id})" title="Редагувати" ${!canEdit?'disabled':''}><i class="fas fa-edit"></i></button>
          <button class="btn btn-${u.is_active?'warning':'success'} btn-sm btn-icon" onclick="toggleActive(${u.id}, ${u.is_active})" title="${u.is_active?'Деактивувати':'Активувати'}" ${!canEdit?'disabled':''}>
            <i class="fas fa-${u.is_active?'ban':'check'}"></i>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="openDelete(${u.id})" title="Видалити" ${isMe||!canEdit?'disabled':''}><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// Modal
function openModal() {
  document.getElementById('modal-title').textContent = 'Новий співробітник';
  document.getElementById('emp-id').value = '';
  document.getElementById('emp-name').value = '';
  document.getElementById('emp-email').value = '';
  document.getElementById('emp-phone').value = '';
  document.getElementById('emp-role').value = 'agent';
  document.getElementById('emp-password').value = '';
  document.getElementById('emp-password').required = true;
  document.getElementById('pwd-label').textContent = "Пароль *";
  document.getElementById('pwd-hint').style.display = 'none';
  document.getElementById('emp-modal').classList.add('open');
}

function openEdit(id) {
  const u = allEmployees.find(e => e.id === id);
  if (!u) return;
  document.getElementById('modal-title').textContent = 'Редагування співробітника';
  document.getElementById('emp-id').value = u.id;
  document.getElementById('emp-name').value = u.name;
  document.getElementById('emp-email').value = u.email;
  document.getElementById('emp-phone').value = u.phone || '';
  document.getElementById('emp-role').value = u.role;
  document.getElementById('emp-password').value = '';
  document.getElementById('emp-password').required = false;
  document.getElementById('pwd-label').textContent = 'Новий пароль';
  document.getElementById('pwd-hint').style.display = 'block';
  document.getElementById('emp-modal').classList.add('open');
}

function closeModal() { document.getElementById('emp-modal').classList.remove('open'); }

async function saveEmployee(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  const id = document.getElementById('emp-id').value;
  const body = {
    name:     document.getElementById('emp-name').value,
    email:    document.getElementById('emp-email').value,
    phone:    document.getElementById('emp-phone').value,
    role:     document.getElementById('emp-role').value,
    password: document.getElementById('emp-password').value || undefined,
  };
  try {
    if (id) {
      await api.put('/employees/' + id, body);
      toast('Співробітника оновлено', 'success');
    } else {
      await api.post('/employees', body);
      toast('Співробітника додано', 'success');
    }
    closeModal();
    loadEmployees();
  } catch(ex) {
    toast(ex.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleActive(id, current) {
  try {
    await api.put('/employees/' + id, { is_active: current ? 0 : 1 });
    toast(current ? 'Співробітника деактивовано' : 'Співробітника активовано', 'success');
    loadEmployees();
  } catch(e) { toast(e.message, 'error'); }
}

// Delete
function openDelete(id) {
  deleteId = id;
  document.getElementById('del-modal').classList.add('open');
}
function closeDelModal() {
  document.getElementById('del-modal').classList.remove('open');
  deleteId = null;
}

document.getElementById('confirm-del-btn').onclick = async () => {
  if (!deleteId) return;
  try {
    await api.del('/employees/' + deleteId);
    closeDelModal();
    toast('Співробітника видалено', 'success');
    loadEmployees();
  } catch(e) { toast(e.message, 'error'); }
};
