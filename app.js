/* =========================================================
   小王的一天 — app.js (Supabase Auth & Database)
   ========================================================= */

const SUPABASE_URL  = 'https://giuciapsbnspgpojwwrx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWNpYXBzYm5zcGdwb2p3d3J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjQ2OTcsImV4cCI6MjEwNjUwMDY5N30.5FBH4ZKl6MPfu2irtBIkJeSG7mi3qQqCr1Zh3Smy3_k';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ==================== STATE ==================== */
const state = {
  user: null, // Data user dari Supabase
  materials: [],
  editingId: null,
  previewId: null,
  role: 'mahasiswa', // Role yang dipilih saat daftar/login
  registering: false,
};

const $  = (s, r=document) => r.querySelector(s); const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function toast(msg, type='') {
  const el = $('#toast');   el.textContent = msg;   el.className = 'toast show ' + type;   clearTimeout(el._t);   el._t = setTimeout(() => el.className = 'toast ' + type, 2600); }  function show(viewId) {   $$('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  window.scrollTo({ top: 0 });
}

function openModal(id) { $('#'+id).classList.add('open'); }
function closeModal(id) { $('#'+id).classList.remove('open'); }

function fmtSize(bytes) {
  if (!bytes) return 'Ukuran tidak diketahui';
  const k = 1024, u = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + u[i];
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' });
}

/* ==================== AUTHENTICATION (SUPABASE) ==================== */
function initLogin() {
  const roleToggle = $('#role-toggle');   roleToggle.addEventListener('click', e => {     const btn = e.target.closest('.role-btn');     if (!btn) return;     state.role = btn.dataset.role;     $$('.role-btn', roleToggle).forEach(b => b.classList.toggle('active', b === btn));
    if (state.role === 'admin' && state.registering) toggleRegister(false);
  });

  $('#register-toggle').addEventListener('click', () => toggleRegister(!state.registering));

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'Memproses...';
    
    if (state.registering) handleRegister().finally(() => resetBtn(btn, 'Daftar'));
    else handleLogin().finally(() => resetBtn(btn, 'Masuk'));
  });

  // Pantau status login secara otomatis
  db.auth.onAuthStateChange((event, session) => {
    if (session) {
      // Simpan data metadata user ke state
      state.user = {
        email: session.user.email,
        nama: session.user.user_metadata.nama || 'User',
        nim: session.user.user_metadata.nim || '-',
        role: session.user.user_metadata.role || 'mahasiswa'
      };
      routeAfterLogin();
    } else {
      state.user = null;
      show('view-login');
    }
  });
}

function resetBtn(btn, text) {
  btn.disabled = false;
  btn.textContent = text;
}

function toggleRegister(on) {
  state.registering = on;
  $('#register-fields').classList.toggle('hidden', !on);
  $('#login-submit').textContent = on ? 'Daftar' : 'Masuk';
  $('#register-toggle').textContent = on ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
  
  // Mahasiswa butuh form Nama & NIM, Admin tidak
  $('#reg-nama').required = on && state.role === 'mahasiswa';
  $('#reg-nim').required = on && state.role === 'mahasiswa';
}

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  
  if (error) {
    return toast(error.message === 'Invalid login credentials' ? 'Email atau Password salah' : error.message, 'error');
  }

  // Cek apakah role yang di-klik di UI sesuai dengan role asli di database
  const userRole = data.user.user_metadata.role || 'mahasiswa';
  if (state.role !== userRole) {
    await db.auth.signOut();
    return toast(`Akun ini terdaftar sebagai ${userRole.toUpperCase()}. Silakan pilih role yang sesuai.`, 'error');
  }
  
  toast('Berhasil masuk!', 'success');
}

async function handleRegister() {
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const nama = $('#reg-nama').value.trim();
  const nim = $('#reg-nim').value.trim();

  // Daftarkan ke Supabase Auth dengan metadata khusus
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: {
        nama: state.role === 'admin' ? 'Administrator' : nama,
        nim: state.role === 'admin' ? '-' : nim,
        role: state.role // Simpan role ke database user
      }
    }
  });

  if (error) return toast(error.message, 'error');
  toast('Akun berhasil dibuat! Selamat datang.', 'success');
}

function routeAfterLogin() {
  if (!state.user) return;
  
  if (state.user.role === 'admin') {
    $('#admin-name').textContent = state.user.nama;
    show('view-admin');
    loadAdminTable();
  } else {
    $('#student-name').textContent = `${state.user.nama} · ${state.user.nim}`;
    show('view-student');
    loadStudentCards();
  }
}

async function logout() {
  await db.auth.signOut();
  $('#login-form').reset();
  toggleRegister(false);
  toast('Berhasil keluar', 'success');
}

/* ==================== DATA MATERIALS ==================== */
async function fetchMaterials() {
  const { data, error } = await db
    .from('materials')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) {
    toast('Gagal memuat database', 'error');
    throw error;
  }
  state.materials = data || [];
  return state.materials;
}

/* ==================== STUDENT UI ==================== */
async function loadStudentCards() {
  const wrap = $('#student-cards');
  wrap.innerHTML = '<div class="empty">Memuat latihan…</div>';
  try {
    const list = await fetchMaterials();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty">Belum ada latihan. Hubungi admin.</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach((m, i) => wrap.appendChild(buildCard(m, i)));
  } catch (err) {
    console.error(err);
  }
}

function buildCard(m, i) {
  const el = document.createElement('div');
  el.className = 'card';
  const thumbStyle = m.gambar_url ? `background-image:url('${m.gambar_url}')` : '';
  el.innerHTML = `
    <div class="card-head">
      <div class="card-thumb" style="${thumbStyle}">${m.gambar_url ? '' : (i+1)}</div>
      <div>
        <div class="card-title">${escapeHtml(m.judul)}</div>
        <div class="card-tema">Tema: ${escapeHtml(m.tema)}</div>
      </div>
    </div>
    <div class="card-body">${escapeHtml(m.deskripsi || 'Tidak ada deskripsi.')}</div>
    <div class="card-foot">
      <button class="btn btn-primary">Mulai Latihan</button>
    </div>
  `;
  el.querySelector('button').addEventListener('click', () => openPreview(m.id, 'student'));
  return el;
}

/* ==================== ADMIN UI ==================== */
async function loadAdminTable() {
  const tbody = $('#admin-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="empty">Memuat data…</td></tr>';
  try {
    const list = await fetchMaterials();
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Belum ada konten. Klik "Tambah Konten".</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    list.forEach((m, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td><strong>${escapeHtml(m.judul)}</strong></td>
        <td>${escapeHtml(m.tema)}</td>
        <td>${fmtDate(m.created_at)}</td>
        <td>
          <div class="actions">
            <button class="icon-btn" data-act="view" title="Preview">👁</button>
            <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
            <button class="icon-btn danger" data-act="del" title="Hapus">🗑</button>
          </div>
        </td>
      `;
      tr.querySelector('[data-act="view"]').onclick = () => openPreview(m.id, 'admin');
      tr.querySelector('[data-act="edit"]').onclick = () => openForm(m.id);
      tr.querySelector('[data-act="del"]').onclick  = () => removeMaterial(m.id, m.judul);
      tbody.appendChild(tr);
    });
  } catch (err) {}
}

/* ==================== MODALS ==================== */
function openPreview(id, source) {
  const m = state.materials.find(x => x.id === id);
  if (!m) return;
  state.previewId = id;

  const img = $('#preview-img');
  img.style.backgroundImage = m.gambar_url ? `url('${m.gambar_url}')` : 'linear-gradient(135deg,#fca5a5,#f87171)';
  
  $('#preview-badge').textContent = m.judul;
  $('#preview-title').textContent = m.tema;
  $('#preview-desc').textContent  = m.deskripsi || 'Tidak ada deskripsi.';

  const row = $('#preview-file-row');
  if (m.file_url) {
    row.classList.remove('hidden');
    $('#preview-file-name').textContent = m.file_name || 'file';
    $('#preview-file-size').textContent = fmtSize(m.file_size);
    $('#preview-download').href = m.file_url;
  } else {
    row.classList.add('hidden');
  }
  openModal('modal-preview');
}

function openForm(id = null) {
  state.editingId = id;
  const form = $('#content-form');
  form.reset();
  $('#f-gambar-preview').classList.add('hidden');
  $('#f-gambar-preview').style.backgroundImage = '';
  $('#f-file-name').textContent = '';

  if (id) {
    const m = state.materials.find(x => x.id === id);
    $('#form-title').textContent = 'Edit Konten Kuis';
    $('#f-judul').value = m.judul || '';
    $('#f-tema').value = m.tema || '';
    $('#f-deskripsi').value = m.deskripsi || '';
    if (m.gambar_url) {
      $('#f-gambar-preview').style.backgroundImage = `url('${m.gambar_url}')`;
      $('#f-gambar-preview').classList.remove('hidden');
    }
    if (m.file_name) $('#f-file-name').textContent = 'File saat ini: ' + m.file_name;
  } else {
    $('#form-title').textContent = 'Tambah Konten Kuis';
  }
  openModal('modal-form');
}

function initForm() {
  $('#f-gambar').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran gambar maksimal 5MB', 'error');
    const reader = new FileReader();
    reader.onload = ev => {
      $('#f-gambar-preview').style.backgroundImage = `url('${ev.target.result}')`;
      $('#f-gambar-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  $('#f-file').addEventListener('change', e => {
    const f = e.target.files[0];
    $('#f-file-name').textContent = f ? `File dipilih: ${f.name} (${fmtSize(f.size)})` : '';
  });

  $('#content-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#form-submit');
    btn.disabled = true; btn.textContent = 'Menyimpan…';

    try {
      const payload = { 
        judul: $('#f-judul').value.trim(), 
        tema: $('#f-tema').value.trim(), 
        deskripsi: $('#f-deskripsi').value.trim() 
      };

      const gFile = $('#f-gambar').files[0];
      if (gFile) payload.gambar_url = await uploadFile('gambar', gFile);

      const kFile = $('#f-file').files[0];
      if (kFile) {
        payload.file_url = await uploadFile('kuis', kFile);
        payload.file_name = kFile.name;
        payload.file_size = kFile.size;
      }

      if (state.editingId) {
        await db.from('materials').update(payload).eq('id', state.editingId);
        toast('Konten diperbarui', 'success');
      } else {
        await db.from('materials').insert(payload);
        toast('Konten ditambahkan', 'success');
      }

      closeModal('modal-form');
      if (state.user.role === 'admin') loadAdminTable();
      else loadStudentCards();
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Simpan';
    }
  });
}

async function uploadFile(bucket, file) {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await db.storage.from(bucket).upload(path, file, { cacheControl: '3600' });
  if (error) throw error;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function removeMaterial(id, judul) {
  if (!confirm(`Hapus "${judul}"?`)) return;
  const { error } = await db.from('materials').delete().eq('id', id);
  if (error) return toast('Gagal menghapus', 'error');
  toast('Konten dihapus', 'success');
  loadAdminTable();
}

function openQuiz() {
  const m = state.materials.find(x => x.id === state.previewId);
  if (!m) return;
  $('#quiz-title').textContent = `Latihan: ${m.tema}`;
  $('#quiz-img').style.backgroundImage = m.gambar_url ? `url('${m.gambar_url}')` : 'linear-gradient(135deg,#fca5a5,#f87171)';
  $('#quiz-desc').textContent = m.deskripsi || '';
  closeModal('modal-preview');
  openModal('modal-quiz');
}

/* ==================== INIT ==================== */
function initModals() {
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal')?.classList.remove('open')));$$
('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initForm();
  initModals();

  $('#add-content-btn').addEventListener('click', () => openForm(null));
  $('#preview-start').addEventListener('click', openQuiz);
  $('#quiz-finish').addEventListener('click', () => { closeModal('modal-quiz'); toast('Latihan selesai! 🎉', 'success'); });
  $('#logout-btn').addEventListener('click', logout);
  $('#logout-btn-2').addEventListener('click', logout);
});